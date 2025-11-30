import "../config/loadEnv.js";
import express from "express";
import Booking from "../models/Booking.js";
import {
  sendMessage,
  sendButtonsMessage,
  sendListMessage,
  sendUrlButtonMessage,
  sendListMessageOne,
} from "../utils/whatsapp.js";
import {
  getAvailableSlotsForDate,
  createEvent,
} from "../utils/googleCalendar.js";
import { createPaymentLink } from "../utils/payments.js";

const router = express.Router();

// ============================================================================
// CONSTANTS
// ============================================================================

const TIME_PERIODS = {
  morning: { start: 6, end: 10.5, label: "6 AM – 10:30 AM", emoji: "🌅" },
  midday: { start: 10.5, end: 15, label: "10:30 AM – 3 PM", emoji: "☀️" },
  afternoon: { start: 15, end: 19.5, label: "3 PM – 7:30 PM", emoji: "🌤️" },
  evening: { start: 19.5, end: 24, label: "7:30 PM – 12 AM", emoji: "🌃" },
};

const ADDON_PRICES = {
  gym: { name: "Gym Access (Steam / Sauna)", price: 2000 },
  pool: { name: "Pool Access (Steam / Sauna)", price: 2000 },
};

const MEMBERSHIP_PAGE_URL =
  process.env.MEMBERSHIP_PAGE_URL || "https://twenty44.in/membership";

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const isSlotAvailable = async (date, timeSlot) => {
  try {
    // Check if slot is primary slot for any paid booking
    const existingPrimary = await Booking.findOne({
      date,
      time_slot: timeSlot,
      paid: true,
    });

    // Check if slot is in booked_slots array for any paid booking
    const existingInArray = await Booking.findOne({
      date,
      booked_slots: timeSlot,
      paid: true,
    });

    return !existingPrimary && !existingInArray;
  } catch (err) {
    console.error("Error checking slot availability:", err);
    return false;
  }
};

const extractMessageContent = (message) => {
  // WATI webhook has similar structure to WhatsApp Cloud API
  const interactive = message?.interactive || {};
  const buttonReply = interactive?.button_reply || null;
  const listReply = interactive?.list_reply || null;
  const incomingText = message.text?.body?.trim() || "";

  const msgRaw =
    listReply?.id ||
    buttonReply?.id ||
    listReply?.title ||
    buttonReply?.title ||
    incomingText ||
    "";

  return {
    msg: String(msgRaw).trim(),
    msgLower: String(msgRaw).trim().toLowerCase(),
    from: message.from,
    messageId: message?.id,
  };
};

const isWatiEventPayload = (body = {}) => {
  return Boolean(body.eventType && body.waId);
};

const buildMessageFromWatiEvent = (payload = {}) => {
  // Extract interactive button/list reply
  let interactive = null;

  if (payload.interactiveButtonReply) {
    interactive = {
      type: "button_reply",
      button_reply: {
        id: payload.interactiveButtonReply.id, // Use the button ID (e.g., "1", "2")
        title: payload.interactiveButtonReply.title,
      },
    };
  } else if (payload.listReply) {
    interactive = {
      type: "list_reply",
      list_reply: {
        id: payload.listReply.id,
        title: payload.listReply.title,
      },
    };
  }

  return {
    from: payload.waId,
    id:
      payload.whatsappMessageId ||
      payload.id ||
      payload.conversationId ||
      payload.ticketId ||
      undefined,
    text: {
      body: typeof payload.text === "string" ? payload.text : "",
    },
    interactive: interactive, // ← Pass the interactive object
  };
}; /*const extractMessageContent = (message) => {
  const interactive = message?.interactive || {};
  const buttonReply = interactive?.button_reply || null;
  const listReply = interactive?.list_reply || null;
  const incomingText = message.text?.body?.trim() || "";

  const msgRaw =
    listReply?.id ||
    buttonReply?.id ||
    listReply?.title ||
    buttonReply?.title ||
    incomingText ||
    "";

  return {
    msg: String(msgRaw).trim(),
    msgLower: String(msgRaw).trim().toLowerCase(),
    from: message.from,
    messageId: message?.id,
  };
}; */

const isDuplicateMessage = (booking, messageId) => {
  if (!messageId || !booking.meta) return false;
  return booking.meta.lastMessageId === messageId;
};

const markMessageAsProcessed = async (booking, messageId) => {
  if (!messageId) return;
  if (!booking.meta) booking.meta = {};
  booking.meta.lastMessageId = messageId;
  booking.markModified("meta");
  await booking.save();
};

const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`);
  }
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const generateFallbackSlots = (startHour, endHour) => {
  const slots = [];
  const formatTime12Hour = (hour) => {
    const isHalfHour = hour % 1 !== 0;
    const baseHour = Math.floor(hour);
    const period = baseHour >= 12 ? "PM" : "AM";
    let displayHour = baseHour % 12;
    if (displayHour === 0) displayHour = 12;
    const minutes = isHalfHour ? "30" : "00";
    return `${displayHour}:${minutes} ${period}`;
  };

  // Generate 9 slots for the period (1.5 hour intervals for 4 periods = 9 slots each)
  const duration = endHour - startHour;
  const slotDuration = duration / 9;

  for (let i = 0; i < 9; i++) {
    const start = startHour + i * slotDuration;
    const end = start + slotDuration;
    const startTimeStr = formatTime12Hour(start);
    const endTimeStr = formatTime12Hour(end);
    slots.push(`${startTimeStr} - ${endTimeStr}`);
  }

  return slots;
};

const getAvailableDates = async () => {
  const datesWithSlots = [];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const dayName = days[date.getDay()];
    const day = String(date.getDate()).padStart(2, "0");
    const month = months[date.getMonth()];
    const dateStr = date.toISOString().split("T")[0];

    try {
      const slots = await getAvailableSlotsForDate(dateStr);
      if (slots.length > 0) {
        datesWithSlots.push({
          dateStr,
          title: `${dayName}, ${day} ${month}`,
          availableCount: slots.length,
        });
      }
    } catch (error) {
      console.error(`Error checking availability for ${dateStr}:`, error);
    }
  }

  // Fallback if no dates found
  if (datesWithSlots.length === 0) {
    console.warn("⚠️ Calendar API unavailable, showing all dates as fallback");
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dayName = days[date.getDay()];
      const day = String(date.getDate()).padStart(2, "0");
      const month = months[date.getMonth()];
      const dateStr = date.toISOString().split("T")[0];

      datesWithSlots.push({
        dateStr,
        title: `${dayName}, ${day} ${month}`,
        availableCount: 36, // 9 slots x 4 periods
      });
    }
  }

  return datesWithSlots;
};

// ============================================================================
// MESSAGE SENDERS
// ============================================================================

const sendWelcomeMessage = async (to) => {
  const welcomeButtons = [
    { id: "1", title: "Book A Court" },
    { id: "2", title: "Discover Memberships" },
  ];
  await sendButtonsMessage(
    to,
    "Welcome to Twenty44! How can we help you today?",
    welcomeButtons,
  );
};

const sendSessionExpired = async (to) => {
  await sendMessage(to, 'Session expired. Please type "start" to begin again.');
};

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

const handleWelcomeAction = async (from, booking, msg) => {
  const action = msg.split("_")[1];

  if (msg === "2") {
    // Send membership link
    try {
      await sendUrlButtonMessage(
        from,
        "Explore our exclusive membership plans and benefits!",
        MEMBERSHIP_PAGE_URL,
        "View Memberships",
      );
    } catch (e) {
      await sendMessage(
        from,
        `Explore our memberships: ${MEMBERSHIP_PAGE_URL}`,
      );
    }
    // Reset booking for fresh start
    await Booking.deleteOne({ phone: from });
    return;
  }

  if (msg === "1") {
    booking.step = "collecting_name";
    await booking.save();
    await sendMessage(
      from,
      "Great! Let's book your court.\n\nPlease enter your full name:",
    );
  }
};

const handleNameCollection = async (from, booking, msg) => {
  if (!msg || msg.trim().length < 2) {
    await sendMessage(from, "Please enter a valid full name:");
    return;
  }

  booking.name = msg.trim();
  booking.step = "selecting_date";
  booking.markModified("meta");
  await booking.save();

  console.log(`Name collected: ${booking.name}`);

  const datesWithSlots = await getAvailableDates();
  const dateRows = datesWithSlots.map((d, idx) => ({
    id: `dt${idx}`,
    title: d.title,
    description: `${d.availableCount} slots available`,
  }));

  // Store date mapping
  if (!booking.meta) booking.meta = {};
  booking.meta.dateMapping = datesWithSlots.reduce((acc, d, idx) => {
    acc[`dt${idx}`] = d.dateStr;
    return acc;
  }, {});
  booking.markModified("meta");
  await booking.save();

  await sendListMessage(from, "Select Date", [
    { title: "Available Dates", rows: dateRows },
  ]);
};

// REPLACE the handleDateSelection function (around line 179):
const handleDateSelection = async (from, booking, msg) => {
  console.log("Date selection detected:", msg);

  if (!booking.meta?.dateMapping) {
    await sendSessionExpired(from);
    return;
  }

  // Handle WATI's transformed ID format "0-4" -> "dt4"
  let lookupId = msg;
  if (msg.match(/^\d+-\d+$/)) {
    const [sectionIndex, rowIndex] = msg.split("-").map(Number);
    lookupId = `dt${rowIndex}`;
    console.log(`Transformed WATI ID ${msg} to ${lookupId}`);
  }

  const selectedDate = booking.meta.dateMapping[lookupId];
  if (!selectedDate) {
    console.log(`No date found for ID: ${lookupId} (from ${msg})`);
    await sendMessage(
      from,
      'Invalid date selection. Please type "start" to try again.',
    );
    return;
  }

  booking.meta.selectedDate = selectedDate;
  booking.step = "selecting_time_period";
  booking.markModified("meta");
  await booking.save();

  console.log("Saved selected date:", selectedDate);

  await sendListMessage(from, "Select Time Period", [
    {
      title: "Select Time Period",
      rows: [
        {
          id: "period_morning",
          title: "6 AM - 10:30 AM",
          description: "Morning",
        },
        {
          id: "period_midday",
          title: "10:30 AM - 3 PM",
          description: "Mid Day",
        },
        {
          id: "period_afternoon",
          title: "3 PM - 7:30 PM",
          description: "Afternoon",
        },
        {
          id: "period_evening",
          title: "7:30 PM - 12 AM",
          description: "Evening",
        },
      ],
    },
  ]);
};

const handleTimePeriodSelection = async (from, booking, msg) => {
  // Handle WATI's transformed ID format "0-1" -> "period_midday"
  let period = msg.replace("period_", "");

  if (msg.match(/^\d+-\d+$/)) {
    const [sectionIndex, rowIndex] = msg.split("-").map(Number);
    // Map row index to period name
    const periodMap = {
      0: "morning",
      1: "midday",
      2: "afternoon",
      3: "evening",
    };
    period = periodMap[rowIndex];
    console.log(`Transformed WATI period ID ${msg} to ${period}`);
  }

  const selectedDate = booking.meta.selectedDate;

  if (!selectedDate) {
    await sendSessionExpired(from);
    return;
  }

  if (!period || !TIME_PERIODS[period]) {
    console.log(`Invalid period: ${period} (from msg: ${msg})`);
    await sendMessage(from, "Invalid time period selected.");
    return;
  }

  booking.meta.selectedPeriod = period;
  booking.step = "selecting_time_slot";
  booking.markModified("meta");
  await booking.save();

  const timePeriod = TIME_PERIODS[period];

  let availableSlotStrings = [];
  try {
    availableSlotStrings = await getAvailableSlotsForDate(selectedDate);
  } catch (error) {
    console.warn("⚠️ Calendar API unavailable, generating fallback slots");
    availableSlotStrings = generateFallbackSlots(
      timePeriod.start,
      timePeriod.end,
    );
  }

  // Filter slots for this period (or use fallback slots directly)
  const periodSlots =
    availableSlotStrings.length === 9
      ? availableSlotStrings.map((s) => ({ formatted: s }))
      : availableSlotStrings
          .filter((slotString) => {
            if (!slotString || typeof slotString !== "string") return false;
            const [start] = slotString.split(" - ");
            if (!start) return false;
            const slotHour = parseInt(start.split(":")[0], 10);
            return slotHour >= timePeriod.start && slotHour < timePeriod.end;
          })
          .map((slotString) => ({ formatted: slotString }));

  if (periodSlots.length === 0) {
    await sendMessage(
      from,
      `No available slots for ${timePeriod.label}. Please choose another time period.`,
    );
    return;
  }

  const slotRows = periodSlots.map((slot, idx) => ({
    id: `sl${idx}`,
    title: slot.formatted,
    description: "Available",
  }));

  booking.meta.slotMapping = periodSlots.reduce((acc, slot, idx) => {
    acc[`sl${idx}`] = slot.formatted;
    return acc;
  }, {});
  booking.markModified("meta");
  await booking.save();

  await sendListMessage(from, "Select Time Slot", [
    {
      title: `${timePeriod.emoji} ${timePeriod.label}`,
      rows: slotRows,
    },
  ]);
};
const handleSlotSelection = async (from, booking, msg) => {
  const timeRange = booking.meta?.slotMapping?.[msg];
  const date = booking.meta?.selectedDate;

  if (!timeRange || !date) {
    await sendSessionExpired(from);
    return;
  }

  // Check availability
  const available = await isSlotAvailable(date, timeRange);
  if (!available) {
    await sendMessage(
      from,
      "Sorry, this slot is no longer available. Please select a different time slot.",
    );
    return;
  }

  // Store first slot
  if (!booking.meta.bookedSlots) {
    booking.meta.bookedSlots = [];
  }
  booking.meta.bookedSlots.push(timeRange);

  booking.step = "asking_additional_slot";
  booking.markModified("meta");
  await booking.save();

  // Ask if they want to add another slot
  const addSlotButtons = [
    { id: "addslot_yes", title: "Yes, add another" },
    { id: "addslot_no", title: "No, continue" },
  ];

  await sendButtonsMessage(
    from,
    `Slot added: ${timeRange}\n\nWould you like to add an additional slot?`,
    addSlotButtons,
  );
};

//==========================================================================================================

const handleAdditionalSlotQuestion = async (from, booking, msg) => {
  const response = msg.split("_")[1];

  if (response === "yes") {
    // Show time period selection again
    booking.step = "selecting_time_period_additional";
    await booking.save();

    await sendListMessage(from, "Select Time Period", [
      {
        title: "Select Time Period",
        rows: [
          // Your original addonsList goes here as the 'rows' property
          {
            id: "period_morning",
            title: "6 AM - 10:30 AM",
            description: "Morning",
          },
          {
            id: "period_midday",
            title: "10:30 AM - 3 PM",
            description: "Mid Day",
          },
          {
            id: "period_afternoon",
            title: "3 PM - 7:30 PM",
            description: "Afternoon",
          },
          {
            id: "period_evening",
            title: "7:30 PM - 12 AM",
            description: "Evening",
          },
        ],
      },
    ]);
    //    ===================================================================================================================
  } else {
    // Proceed to addons
    booking.step = "selecting_addons";
    await booking.save();
    await showAddonSelection(from);
  }
};

// REPLACE the handleAdditionalSlotSelection function (around line 357):
const handleAdditionalSlotSelection = async (from, booking, msg) => {
  // Handle WATI's transformed ID format "0-4" -> "sl4"
  let lookupId = msg;
  if (msg.match(/^\d+-\d+$/)) {
    const [sectionIndex, rowIndex] = msg.split("-").map(Number);
    lookupId = `sl${rowIndex}`;
    console.log(`Transformed WATI additional slot ID ${msg} to ${lookupId}`);
  }

  const timeRange = booking.meta?.slotMapping?.[lookupId];
  const date = booking.meta?.selectedDate;

  if (!timeRange || !date) {
    console.log(`No additional slot found for ID: ${lookupId} (from ${msg})`);
    await sendSessionExpired(from);
    return;
  }

  // Check if slot already added
  if (booking.meta.bookedSlots.includes(timeRange)) {
    await sendMessage(
      from,
      "You've already selected this slot. Please choose a different one.",
    );
    return;
  }

  // Check availability
  const available = await isSlotAvailable(date, timeRange);
  if (!available) {
    await sendMessage(
      from,
      "Sorry, this slot is no longer available. Please select a different time slot.",
    );
    return;
  }

  // Add slot
  booking.meta.bookedSlots.push(timeRange);
  booking.step = "asking_additional_slot";
  booking.markModified("meta");
  await booking.save();

  // Ask again
  const addSlotButtons = [
    { id: "addslot_yes", title: "Yes, add another" },
    { id: "addslot_no", title: "No, continue" },
  ];

  const slotsList = booking.meta.bookedSlots
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n");

  await sendButtonsMessage(
    from,
    `Slot added: ${timeRange}\n\nYour slots:\n${slotsList}\n\nWould you like to add another slot?`,
    addSlotButtons,
  );
};

//======================================================================================================
const showAddonSelection = async (from) => {
  await sendListMessage(from, "Select Addons", [
    {
      title: "Additional Services",
      rows: [
        {
          id: "addon_gym",
          title: "Gym Access",
          description: "₹2,000 (Steam / Sauna)",
        },
        {
          id: "addon_pool",
          title: "Pool Access",
          description: "₹2,000 (Steam / Sauna)",
        },
        { id: "addon_none", title: "None", description: "Continue to payment" },
      ],
    },
  ]);
};

//====================================================================================================
const handleAddonSelection = async (from, booking, msg) => {
  const addon = msg.replace("addon_", "");

  if (addon === "none") {
    booking.step = "showing_summary";
    await booking.save();
    await showBookingSummary(from, booking);
    return;
  }

  const selectedAddon = ADDON_PRICES[addon];
  if (!selectedAddon) {
    await sendMessage(from, "Invalid selection. Please try again.");
    return;
  }

  // Initialize addons array if needed
  if (!booking.addons) booking.addons = [];

  // Check if addon already added
  if (booking.addons.some((a) => a.name === selectedAddon.name)) {
    await sendMessage(
      from,
      `${selectedAddon.name} is already added. Please select another addon or choose None.`,
    );
    await showAddonSelection(from);
    return;
  }

  // Add addon
  booking.addons.push(selectedAddon);
  await booking.save();

  // Show selection again
  const currentAddons = booking.addons.map((a) => a.name).join(", ");
  await sendListMessageOne(from, `Added: ${selectedAddon.name}`, [
    {
      title: "Select More Addons",
      rows: [
        {
          id: "addon_gym",
          title: "Gym Access",
          description: "₹2,000 (Steam / Sauna)",
        },
        {
          id: "addon_pool",
          title: "Pool Access",
          description: "₹2,000 (Steam / Sauna)",
        },
        { id: "addon_none", title: "None", description: "Continue to payment" },
      ],
    },
  ]);
};

//==========================================================================================================

const showBookingSummary = async (from, booking) => {
  const baseAmount = Number(process.env.DEFAULT_BOOKING_AMOUNT) || 1000;
  const slotCount = booking.meta?.bookedSlots?.length || 1;
  const slotsAmount = baseAmount * slotCount;
  const addonAmount = (booking.addons || []).reduce(
    (sum, addon) => sum + addon.price,
    0,
  );
  const totalAmount = slotsAmount + addonAmount;

  const formattedDate = formatDate(booking.meta.selectedDate);
  const slotsList = booking.meta.bookedSlots
    .map((s, i) => `  ${i + 1}. ${s}`)
    .join("\n");
  const addonsSummary =
    booking.addons?.length > 0
      ? "\n\n Add-ons:\n" +
        booking.addons
          .map((addon) => `  • ${addon.name}: ₹${addon.price}`)
          .join("\n")
      : "\n\n Add-ons: None";

  const summary = `
*BOOKING SUMMARY*

Name: ${booking.name}
Date: ${formattedDate}

Time Slots (${slotCount}):
${slotsList}${addonsSummary}


*Total Amount: ₹${totalAmount}*

  `.trim();

  await sendMessage(from, summary);

  const confirmButtons = [
    { id: "confirm_yes", title: "Confirm & Pay" },
    { id: "confirm_no", title: "Cancel" },
  ];

  await sendButtonsMessage(
    from,
    "Please confirm your booking:",
    confirmButtons,
  );

  booking.step = "confirming_booking";
  booking.totalAmount = totalAmount;
  await booking.save();
};

const handleBookingConfirmation = async (from, booking, msg) => {
  if (msg === "confirm_no") {
    await Booking.deleteOne({ phone: from });
    await sendMessage(
      from,
      "Booking cancelled. Type 'start' to begin a new booking.",
    );
    return;
  }

  if (msg === "confirm_yes") {
    await processPayment(from, booking);
  }
};

//=============================================================================================================

const processPayment = async (from, booking) => {
  try {
    const date = booking.meta.selectedDate;
    const slots = booking.meta.bookedSlots || [];

    // Final availability check for all slots
    for (const slot of slots) {
      const available = await isSlotAvailable(date, slot);
      if (!available) {
        await sendMessage(
          from,
          `⚠️ Sorry, slot "${slot}" was just booked by someone else. Please start over.`,
        );
        await Booking.deleteOne({ phone: from });
        return;
      }
    }

    // Save booking to DB with all slots
    const updatePayload = {
      name: booking.name,
      date,
      time_slot: slots[0], // Primary slot for schema compatibility
      booked_slots: slots, // All slots
      addons: booking.addons || [],
      totalAmount: booking.totalAmount,
      meta: booking.meta,
      step: "payment_pending",
      paid: false,
    };

    const updated = await Booking.findByIdAndUpdate(
      booking._id,
      updatePayload,
      { new: true, upsert: false },
    );

    if (!updated) {
      console.warn("Failed to update booking record:", booking._id);
      await sendMessage(from, "⚠️ Could not create booking. Please try again.");
      return;
    }

    booking = updated;
    console.log("Booking reserved in DB:", booking._id.toString());

    // Create payment link
    try {
      const paymentUrl = await createPaymentLink(booking, booking.totalAmount);
      if (paymentUrl) {
        const paymentMsg = `*Payment Required*\n\nAmount: ₹${booking.totalAmount}\n\nPlease complete your payment to confirm the booking.\n\nWe'll automatically confirm once payment is received! ✅`;

        try {
          await sendUrlButtonMessage(from, paymentMsg, paymentUrl, "Pay Now");
        } catch (e) {
          console.warn("URL button failed, sending text link:", e?.message);
          await sendMessage(from, `${paymentMsg}\n\n${paymentUrl}`);
        }
      }
    } catch (err) {
      console.error("Failed to create payment link:", err);
      await sendMessage(
        from,
        "⚠️ Unable to generate payment link right now. Our team will contact you shortly for payment details.",
      );
    }
  } catch (error) {
    if (error?.code === 11000) {
      console.warn("Slot conflict during payment:", error);
      await sendMessage(
        from,
        "⚠️ Sorry, one of your slots was just booked. Please type 'start' to choose another time.",
      );
      await Booking.deleteOne({ phone: from });
      return;
    }

    console.error("Error in processPayment:", error);
    throw error;
  }
};

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

const handleStartCommand = async (from) => {
  await Booking.deleteOne({ phone: from });
  await sendWelcomeMessage(from);
};

const handleExitCommand = async (from) => {
  await Booking.deleteOne({ phone: from });
  await sendMessage(
    from,
    "Booking cancelled. Type 'start' anytime to begin again.",
  );
};

// ============================================================================
// WEBHOOK ENDPOINTS
// ============================================================================

router.get("/", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  }
  console.error("Webhook verification failed");
  res.sendStatus(403);
});

router.post("/", async (req, res) => {
  console.log("=== NEW WATI WEBHOOK REQUEST ===");
  console.log("Request method:", req.method);
  console.log("Request path:", req.path);
  console.log("Request headers:", JSON.stringify(req.headers, null, 2));
  console.log("Webhook body:", JSON.stringify(req.body, null, 2));
  console.log("Query params:", JSON.stringify(req.query, null, 2));

  try {
    // WATI webhook format - try multiple possible structures
    let message = null;
    let entry = null;
    let changes = null;

    if (isWatiEventPayload(req.body)) {
      if (req.body.owner) {
        console.log(
          `Ignoring owner eventType ${req.body.eventType} for waId ${req.body.waId}`,
        );
        return res.sendStatus(200);
      }
      message = buildMessageFromWatiEvent(req.body);
      console.log(
        "Processed WATI eventType payload into message:",
        JSON.stringify(message, null, 2),
      );
    } else {
      // Try WhatsApp Cloud API format first (entry.changes.value.messages)
      entry = req.body.entry?.[0];
      changes = entry?.changes?.[0]?.value;
      message = changes?.messages?.[0];

      // If not found, try direct WATI format (req.body.message or req.body)
      if (!message) {
        message = req.body.message || req.body;
        console.log(
          "Trying direct WATI format, message:",
          JSON.stringify(message, null, 2),
        );
      }

      // If still not found, try nested structure
      if (!message && req.body.data) {
        message = req.body.data.message || req.body.data;
        console.log(
          "Trying data.message format, message:",
          JSON.stringify(message, null, 2),
        );
      }
    }

    if (!message) {
      console.log("⚠️ No message found in webhook - possible format mismatch");
      console.log("Full request body structure:", Object.keys(req.body));
      return res.sendStatus(200);
    }

    const { msg, msgLower, from, messageId } = extractMessageContent(message);
    if (!from) {
      console.warn("No sender (from) detected in message payload. Ignoring.");
      return res.sendStatus(200);
    }

    // Find or create booking
    let booking = await Booking.findOne({ phone: from });

    console.log(
      `Processing message from ${from}: ${msg} (step: ${booking?.step || "none"})`,
    );

    if (!booking) {
      booking = new Booking({ phone: from, step: "welcome", meta: {} });
      await booking.save();
      console.log("Created new booking record:", booking._id?.toString());
      await sendWelcomeMessage(from);
      return res.sendStatus(200);
    }

    // Check for duplicate messages
    if (isDuplicateMessage(booking, messageId)) {
      console.log("Duplicate webhook ignored", messageId);
      return res.sendStatus(200);
    }
    await markMessageAsProcessed(booking, messageId);

    // Route to appropriate handler (rest of your logic remains the same)
    if (["start", "hi", "hello"].includes(msgLower)) {
      await handleStartCommand(from);
    } else if (["exit", "cancel"].includes(msgLower)) {
      await handleExitCommand(from);
    } else if (msg === "1" || msg === "2") {
      await handleWelcomeAction(from, booking, msg);
    } else if (
      booking.step === "collecting_name" &&
      !msg.startsWith("action_") &&
      !msg.startsWith("dt") &&
      !msg.startsWith("period_") &&
      !msg.startsWith("sl") &&
      !msg.startsWith("addon_") &&
      !msg.startsWith("confirm_") &&
      !msg.startsWith("addslot_")
    ) {
      await handleNameCollection(from, booking, msg);
    } else if (
      msg.startsWith("dt") ||
      (msg.match(/^\d+-\d+$/) && booking.step === "selecting_date")
    ) {
      await handleDateSelection(from, booking, msg);
    } else if (
      (msg.startsWith("period_") ||
        (msg.match(/^\d+-\d+$/) && booking.step === "selecting_time_period")) &&
      booking.step === "selecting_time_period"
    ) {
      await handleTimePeriodSelection(from, booking, msg);
    } else if (
      msg.startsWith("period_") &&
      booking.step === "selecting_time_period_additional"
    ) {
      booking.step = "selecting_time_slot_additional";
      await booking.save();
      await handleTimePeriodSelection(from, booking, msg);
    } else if (
      (msg.startsWith("sl") && /^sl\d+$/.test(msg)) ||
      (msg.match(/^\d+-\d+$/) && booking.step === "selecting_time_slot")
    ) {
      await handleSlotSelection(from, booking, msg);
    } else if (
      (msg.startsWith("sl") && /^sl\d+$/.test(msg)) ||
      (msg.match(/^\d+-\d+$/) &&
        booking.step === "selecting_time_slot_additional")
    ) {
      await handleAdditionalSlotSelection(from, booking, msg);
    } else if (msg.startsWith("addslot_")) {
      await handleAdditionalSlotQuestion(from, booking, msg);
    } else if (msg.startsWith("addon_")) {
      await handleAddonSelection(from, booking, msg);
    } else if (msg.startsWith("confirm_")) {
      await handleBookingConfirmation(from, booking, msg);
    } else {
      console.log(`Unrecognized input: "${msg}" (step: ${booking.step})`);
      await sendMessage(
        from,
        "I didn't understand that. Type 'start' to begin or 'help' for assistance.",
      );
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("Webhook Error:", {
      message: error.message,
      stack: error.stack,
      requestBody: req.body,
    });

    try {
      // Try to extract 'from' from multiple possible webhook formats
      let from = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
      if (!from && req.body?.message) {
        from = req.body.message.from;
      }
      if (!from && req.body?.data?.message) {
        from = req.body.data.message.from;
      }
      if (!from && req.body?.from) {
        from = req.body.from;
      }

      if (from) {
        await sendMessage(
          from,
          "An error occurred. Please try again or type 'start' to restart.",
        );
      }
    } catch (e) {
      console.error("Failed to send error message to user:", e);
    }

    return res.status(500).json({
      error: "Internal Server Error",
      message: error.message,
    });
  }
});

export default router;
