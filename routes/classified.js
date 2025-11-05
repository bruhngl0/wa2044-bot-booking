import express from "express";
import Booking from "../models/Booking.js";
import {
  sendMessage,
  sendButtonsMessage,
  sendListMessage,
  sendUrlButtonMessage,
} from "../utils/whatsapp.js";
import {
  getAvailableSlotsForDate,
  createEvent,
} from "../utils/googleCalendar.js";
import { createPaymentLink } from "../utils/payments.js";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

// ============================================================================
// CONSTANTS
// ============================================================================

const LOCATION_MAP = {
  jw: "JW Marriott",
  taj: "Taj West End",
  itc: "ITC Gardenia",
};

const SPORT_MAP = {
  pickleball: { name: "Pickleball", emoji: "🏓" },
  paddle: { name: "Paddle", emoji: "🎾" },
};

const TIME_PERIODS = {
  morning: { start: 6, end: 14, emoji: "🌅" },
  evening: { start: 14, end: 22, emoji: "🌃" },
};

const ADDON_PRICES = {
  spa: { name: "Spa", price: 2000 },
  gym: { name: "Gym Access", price: 500 },
  sauna: { name: "Sauna", price: 800 },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const isSlotAvailable = async (centre, sport, date, timeSlot) => {
  try {
    const existing = await Booking.findOne({
      centre,
      sport,
      date,
      time_slot: timeSlot,
    });
    return !existing;
  } catch (err) {
    console.error("Error checking slot availability:", err);
    return false;
  }
};

// ---------------------------------------------------------------------------------------------------
//
const extractMessageContent = (message) => {
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

//-----------------------------------------------------------------------------------------------

const isDuplicateMessage = (booking, messageId) => {
  if (!messageId || !booking.meta) return false;
  return booking.meta.lastMessageId === messageId;
};

//---------------------------------------------------------------------------------------------

const markMessageAsProcessed = async (booking, messageId) => {
  if (!messageId) return;
  if (!booking.meta) booking.meta = {};
  booking.meta.lastMessageId = messageId;
  booking.markModified("meta");
  await booking.save();
};

//--------------------------------------------------------------------------------------------

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

//-------------------------------------------------------------------------------------------

const generateFallbackSlots = (startHour, endHour) => {
  const slots = [];
  for (let hour = startHour; hour < endHour; hour++) {
    const startTimeStr = hour.toString().padStart(2, "0") + ":00";
    const endTimeStr = (hour + 1).toString().padStart(2, "0") + ":00";
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
        availableCount: 16,
      });
    }
  }

  return datesWithSlots;
};

// ============================================================================
// MESSAGE SENDERS
// ============================================================================

const sendSportSelection = async (to) => {
  const sportButtons = [{ id: "sport_pickleball", title: "Pickleball" }];
  await sendButtonsMessage(
    to,
    "Welcome to Twenty44. Which sport would you like to play?",
    sportButtons,
  );
};

const sendLocationSelection = async (to) => {
  const locationButtons = [{ id: "location_jw", title: "JW Marriott" }];
  await sendButtonsMessage(
    to,
    "Select your preferred location:",
    locationButtons,
  );
};

const sendWelcomeMessage = async (to) => {
  await sendSportSelection(to);
};

const sendSessionExpired = async (to) => {
  await sendMessage(to, 'Session expired. Please type "start" to begin again.');
};

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

const handleSportSelection = async (from, booking, msg) => {
  const selectedSport = msg.split("_")[1];
  if (!booking.meta) booking.meta = {};
  booking.meta.selectedSport = selectedSport;
  booking.step = "selecting_location";
  booking.markModified("meta");
  await booking.save();

  console.log("Selected sport:", selectedSport);
  await sendLocationSelection(from);
};

//------------------------------------------------------------------------------------------------------------------------------

const handleLocationSelection = async (from, booking, msg) => {
  const selectedLocation = msg.split("_")[1];
  if (!booking.meta) booking.meta = {};
  booking.meta.selectedLocation = selectedLocation;
  booking.step = "selecting_date";
  booking.markModified("meta");
  await booking.save();

  console.log("Selected location:", selectedLocation);

  const datesWithSlots = await getAvailableDates();
  const dateRows = datesWithSlots.map((d, idx) => ({
    id: `dt${idx}`,
    title: d.title,
    description: `${d.availableCount} slots`,
  }));

  // Store date mapping
  booking.meta.dateMapping = datesWithSlots.reduce((acc, d, idx) => {
    acc[`dt${idx}`] = d.dateStr;
    return acc;
  }, {});
  booking.markModified("meta");
  await booking.save();

  console.log("Saved date mapping:", booking.meta.dateMapping);

  await sendListMessage(from, "Select Date", [
    { title: "Available Dates", rows: dateRows },
  ]);
};

//---------------------------------------------------------------------------------------------------------------------------

const handleDateSelection = async (from, booking, msg) => {
  console.log("Date selection detected:", msg);

  if (!booking.meta?.dateMapping) {
    await sendSessionExpired(from);
    return;
  }

  const selectedDate = booking.meta.dateMapping[msg];
  if (!selectedDate) {
    await sendMessage(
      from,
      'Invalid date selection. Please type "start" to try again.',
    );
    return;
  }

  booking.meta.selectedDate = selectedDate;
  booking.meta.currentDate = selectedDate;
  booking.step = "selecting_time_period";
  booking.markModified("meta");
  await booking.save();

  console.log("Saved selected date:", selectedDate);

  const formattedDate = formatDate(selectedDate);

  const timePeriodButtons = [
    { id: "period_morning", title: "Morning" },
    { id: "period_evening", title: "Evening" },
  ];

  await sendButtonsMessage(
    from,
    `Select a time period for ${formattedDate}:`,
    timePeriodButtons,
  );
};

//------------------------------------------------------------------------------------------------------------------------------------

const handleTimePeriodSelection = async (from, booking, msg) => {
  const period = msg.replace("period_", "");
  const selectedDate = booking.meta.currentDate;

  if (!selectedDate) {
    await sendSessionExpired(from);
    return;
  }

  booking.meta.selectedDate = selectedDate;
  booking.meta.selectedPeriod = period;
  booking.step = "selecting_time_slot";
  booking.markModified("meta");
  await booking.save();

  const timePeriod = TIME_PERIODS[period];
  if (!timePeriod) {
    await sendMessage(from, "Invalid time period selected.");
    return;
  }

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

  const periodSlots = availableSlotStrings
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
      `No available slots for ${period} on this date. Please choose another time period or date.`,
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

  console.log("✅ Saved slot mapping:", booking.meta.slotMapping);

  await sendListMessage(from, "Select Time Slot", [
    {
      title: `${timePeriod.emoji} ${period === "morning" ? "Morning" : "Evening"} Slots`,
      rows: slotRows,
    },
  ]);
};

//-----------------------------------------------------------------------------------------------------------------------------------

const handleSlotSelection = async (from, booking, msg) => {
  const timeRange = booking.meta?.slotMapping?.[msg];
  const date = booking.meta?.selectedDate;

  if (!timeRange || !date) {
    await sendSessionExpired(from);
    return;
  }

  const sportName = SPORT_MAP[booking.meta.selectedSport]?.name || "Pickleball";
  const centre =
    LOCATION_MAP[booking.meta.selectedLocation] ||
    booking.meta.selectedLocation;

  // Check availability
  const available = await isSlotAvailable(centre, sportName, date, timeRange);
  if (!available) {
    await sendMessage(
      from,
      "Sorry, this slot is no longer available. Please select a different time slot.",
    );
    return;
  }

  // Store slot selection
  booking.meta.selectedTimeSlot = timeRange;
  booking.meta.confirmDate = date;
  booking.meta.confirmTime = timeRange;
  booking.step = "collecting_name";
  booking.markModified("meta");
  await booking.save();

  await sendMessage(from, "Please enter your full name:");
};

//---------------------------------------------------------------------------------------------------------------------
//
//
const handleNameCollection = async (from, booking, msg) => {
  try {
    // Validate name
    if (!msg || msg.trim().length < 2) {
      await sendMessage(from, "Please enter a valid full name:");
      return;
    }

    booking.name = msg.trim();

    // DON'T save all booking details yet
    // Just save the name and move to addon selection
    booking.step = "selecting_addons";
    booking.markModified("meta");
    await booking.save();

    console.log(`Name collected: ${booking.name} for booking ${booking._id}`);

    // Show addon selection
    const addonsList = [
      {
        title: "Additional Services",
        rows: [
          { id: "addon_spa", title: "Spa", description: "₹2000" },
          { id: "addon_gym", title: "Gym Access", description: "₹500" },
          { id: "addon_sauna", title: "Sauna", description: "₹800" },
          {
            id: "addon_none",
            title: "No thanks, proceed to payment",
            description: "Continue without add-ons",
          },
        ],
      },
    ];

    await sendListMessage(from, "Add Services?", addonsList);
  } catch (error) {
    console.error("Error in handleNameCollection:", error);
    await sendMessage(
      from,
      "Sorry, there was an error. Please type 'start' to restart.",
    );
    throw error;
  }
};

//-------------------------------------------------------------------------------------------------------------------------------------------

const handleBookingConfirmation = async (from, booking, msg) => {
  if (msg === "confirm_no") {
    await Booking.deleteOne({ phone: from });
    await sendMessage(
      from,
      "Booking cancelled. Type 'start' to begin a new booking.",
    );
    return;
  }

  const date = booking.meta?.confirmDate;
  const timeRange = booking.meta?.confirmTime;

  if (!date || !timeRange) {
    await sendSessionExpired(from);
    return;
  }

  const sportInfo =
    SPORT_MAP[booking.meta.selectedSport] || SPORT_MAP.pickleball;
  const location =
    LOCATION_MAP[booking.meta.selectedLocation] ||
    booking.meta.selectedLocation;

  // Check payment status
  if (booking.step === "payment_pending" && !booking.paid) {
    const paymentUrl = booking.meta?.razorpay?.paymentLinkUrl;
    const amount =
      booking.meta?.price || Number(process.env.DEFAULT_BOOKING_AMOUNT) || 300;
    const body = `🔒 Payment required to confirm booking.\nAmount: ₹${amount}\nPlease complete payment and wait for confirmation.`;

    try {
      if (paymentUrl) {
        await sendUrlButtonMessage(from, body, paymentUrl, "Pay Now");
      } else {
        await sendMessage(
          from,
          `${body}\nWe couldn't find a payment link. Please try slot selection again or contact support.`,
        );
      }
    } catch (e) {
      console.warn("Failed to send payment reminder button:", e?.message || e);
      if (paymentUrl) await sendMessage(from, `${body}\n${paymentUrl}`);
    }
    return;
  }

  // Create calendar event
  let calendarCreated = false;
  try {
    await createEvent({
      dateISO: date,
      slot: timeRange,
      summary: `${sportInfo.name} Court Booking`,
      description: `${sportInfo.name} court booking via WhatsApp by ${from}`,
      timezone: process.env.GOOGLE_DEFAULT_TIMEZONE || "Asia/Kolkata",
    });
    calendarCreated = true;
  } catch (error) {
    console.error("⚠️ Failed to create calendar event:", error.message);
  }

  const formattedDate = formatDate(date);
  const calendarNote = calendarCreated
    ? "\n✅ Calendar event created!"
    : "\n⚠️ Note: Calendar sync unavailable";

  await sendMessage(
    from,
    `✅ Booking Confirmed!\n\n${sportInfo.emoji} ${sportInfo.name}\n📍 ${location}\n📅 ${formattedDate}\n🕒 ${timeRange}${calendarNote}\n\nSee you at the court!`,
  );

  await Booking.deleteOne({ phone: from });
};

//-----------------------------------------------------------------------------------------------------------------------

const handleAddonSelection = async (from, booking, msg) => {
  const addon = msg.replace("addon_", "");

  if (addon === "none") {
    // User declined addons, proceed to payment
    booking.step = "processing_payment";
    await booking.save();
    await processPayment(from, booking);
    return;
  }

  const selectedAddon = ADDON_PRICES[addon];
  if (!selectedAddon) {
    await sendMessage(from, "Invalid selection. Please try again.");
    return;
  }

  // Add addon to booking
  if (!booking.addons) booking.addons = [];
  booking.addons.push(selectedAddon);
  await booking.save();

  // Show addon selection again
  const addonsList = [
    {
      title: "Additional Services",
      rows: [
        { id: "addon_spa", title: "Spa", description: "₹2000" },
        { id: "addon_gym", title: "Gym Access", description: "₹500" },
        { id: "addon_sauna", title: "Sauna", description: "₹800" },
        {
          id: "addon_none",
          title: "No thanks, proceed to payment",
          description: "Continue to payment",
        },
      ],
    },
  ];

  const currentAddons = booking.addons.map((a) => a.name).join(", ");
  await sendListMessage(
    from,
    `Added ${selectedAddon.name} ${currentAddons}`,
    addonsList,
  );
};
// -----------------------------------------------------------------------------------------------------------------------

//new handlePyament function

const processPayment = async (from, booking) => {
  try {
    // NOW prepare the final booking with all details
    const baseAmount =
      booking.meta?.price || Number(process.env.DEFAULT_BOOKING_AMOUNT) || 1;
    const addonAmount = (booking.addons || []).reduce(
      (sum, addon) => sum + addon.price,
      0,
    );
    const totalAmount = baseAmount + addonAmount;

    const sportName =
      SPORT_MAP[booking.meta.selectedSport]?.name || "Pickleball";
    const centre =
      LOCATION_MAP[booking.meta.selectedLocation] ||
      booking.meta.selectedLocation;
    const date = booking.meta.confirmDate || booking.meta.selectedDate;
    const timeRange = booking.meta.confirmTime || booking.meta.selectedTimeSlot;

    // Check slot availability one more time before persisting
    const available = await isSlotAvailable(centre, sportName, date, timeRange);
    if (!available) {
      await sendMessage(
        from,
        "⚠️ Sorry, this slot was just booked by someone else. Please start over and choose another slot.",
      );
      await Booking.deleteOne({ phone: from });
      return;
    }

    const updatePayload = {
      sport: sportName,
      centre,
      date,
      time_slot: timeRange,
      name: booking.name,
      addons: booking.addons || [],
      totalAmount: Number(totalAmount),
      meta: booking.meta,
      step: "payment_pending",
      paid: false, // Explicitly set to false
    };

    // Save booking to DB - this creates the slot reservation
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
    console.log("✅ Booking reserved in DB:", booking._id.toString());

    // Format and send summary
    const formattedDate = formatDate(date);
    const addonsSummary =
      booking.addons?.length > 0
        ? "\n\n📋 Add-ons:\n" +
          booking.addons
            .map((addon) => `  • ${addon.name}: ₹${addon.price}`)
            .join("\n")
        : "";

    const summary = `📝 *Booking Summary*\n\n👤 Name: ${booking.name}\n🏓 Sport: ${sportName}\n📍 Location: ${centre}\n📅 Date: ${formattedDate}\n🕒 Time: ${timeRange}${addonsSummary}\n\n💰 *Total Amount: ₹${booking.totalAmount}*`;

    await sendMessage(from, summary);

    // Create and send payment link
    try {
      const paymentUrl = await createPaymentLink(booking, booking.totalAmount);
      if (paymentUrl) {
        const paymentMsg = `💳 *Payment Required*\n\nAmount: ₹${booking.totalAmount}\n\nPlease complete your payment to confirm the booking.\n\nWe'll automatically confirm once payment is received! ✅`;

        try {
          await sendUrlButtonMessage(
            from,
            paymentMsg,
            paymentUrl,
            "💳 Pay Now",
          );
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
    // Handle duplicate booking error
    if (error?.code === 11000) {
      console.warn("Slot conflict during payment:", error);
      await sendMessage(
        from,
        "⚠️ Sorry, this slot was just booked. Please type 'start' to choose another time.",
      );
      await Booking.deleteOne({ phone: from });
      return;
    }

    console.error("Error in processPayment:", error);
    throw error;
  }
};

//---------------------------------------------------------------------------------------------------------------------------

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

const handleCalendarCommand = async (from, booking) => {
  booking.step = "selecting_sport";
  await booking.save();
  await sendSportSelection(from);
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
  console.log("=== NEW WEBHOOK REQUEST ===");

  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const message = changes?.messages?.[0];

    if (!message) {
      console.log("No message found in webhook");
      return res.sendStatus(200);
    }

    const { msg, msgLower, from, messageId } = extractMessageContent(message);
    console.log(`Processing message from ${from}: ${msg}`);

    // Find or create booking
    let booking = await Booking.findOne({ phone: from });
    if (!booking) {
      booking = new Booking({ phone: from, step: "welcome", meta: {} });
      await booking.save();
      console.log("Created new booking record:", {
        id: booking._id?.toString(),
        phone: booking.phone,
      });
      await sendWelcomeMessage(from);
      return res.sendStatus(200);
    }

    // Check for duplicate messages
    if (isDuplicateMessage(booking, messageId)) {
      console.log("Duplicate webhook ignored", messageId);
      return res.sendStatus(200);
    }
    await markMessageAsProcessed(booking, messageId);

    // Route to appropriate handler based on message content and booking step
    // IMPORTANT: Check global commands first, then step-based handlers

    if (["start", "hi", "hello", "1"].includes(msgLower)) {
      await handleStartCommand(from);
    } else if (["exit", "cancel"].includes(msgLower)) {
      await handleExitCommand(from);
    } else if (
      booking.step === "collecting_name" &&
      !msg.startsWith("sport_") &&
      !msg.startsWith("location_") &&
      !msg.startsWith("dt") &&
      !msg.startsWith("period_") &&
      !msg.startsWith("sl") &&
      !msg.startsWith("addon_") &&
      !msg.startsWith("confirm_")
    ) {
      // User is entering their name (not a command)
      await handleNameCollection(from, booking, msg);
    } else if (
      booking.step === "selecting_addons" &&
      msg.startsWith("addon_")
    ) {
      // User is selecting addons
      await handleAddonSelection(from, booking, msg);
    } else if (msg.startsWith("sport_")) {
      await handleSportSelection(from, booking, msg);
    } else if (msg.startsWith("location_")) {
      await handleLocationSelection(from, booking, msg);
    } else if (msg.startsWith("dt")) {
      await handleDateSelection(from, booking, msg);
    } else if (msg.startsWith("period_")) {
      await handleTimePeriodSelection(from, booking, msg);
    } else if (msg.startsWith("sl") && /^sl\d+$/.test(msg)) {
      await handleSlotSelection(from, booking, msg);
    } else if (msg.startsWith("confirm_")) {
      await handleBookingConfirmation(from, booking, msg);
    } else if (msg === "cancel_booking") {
      await handleExitCommand(from);
    } else if (["calendar", "check calendar", "book"].includes(msgLower)) {
      await handleCalendarCommand(from, booking);
    } else {
      console.log(
        `Unrecognized input from ${from}: "${msg}" (step: ${booking.step})`,
      );
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
      const from =
        req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
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
