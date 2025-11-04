import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

// Try importing zonedTimeToUtc from date-fns-tz in a safe way.
// If it is not available, we'll use a fallback to construct UTC ISO strings.
let zonedTimeToUtc = null;
try {
  // prefer namespace import to be compatible with many bundlers
  // eslint-disable-next-line global-require
  const tz = await (async () => {
    try {
      return await import("date-fns-tz");
    } catch (e) {
      return null;
    }
  })();
  if (tz && typeof tz.zonedTimeToUtc === "function")
    zonedTimeToUtc = tz.zonedTimeToUtc;
} catch (e) {
  // ignore
}

// --- Load all environment variables as raw strings ---
const GOOGLE_CLIENT_ID_RAW = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET_RAW = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN_RAW = process.env.GOOGLE_REFRESH_TOKEN;
const GOOGLE_CALENDAR_ID_RAW = process.env.GOOGLE_CALENDAR_ID;
const GOOGLE_DEFAULT_TIMEZONE_RAW = process.env.GOOGLE_DEFAULT_TIMEZONE;

// --- FIX: Trim all environment variables, applying safe defaults after trimming ---
const GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID_RAW?.trim();
const GOOGLE_CLIENT_SECRET = GOOGLE_CLIENT_SECRET_RAW?.trim();
const GOOGLE_REFRESH_TOKEN = GOOGLE_REFRESH_TOKEN_RAW?.trim();

// Critical Fix: Trim GOOGLE_DEFAULT_TIMEZONE to prevent "Invalid time value" errors
const GOOGLE_CALENDAR_ID = GOOGLE_CALENDAR_ID_RAW?.trim() || "primary";
const GOOGLE_DEFAULT_TIMEZONE =
  GOOGLE_DEFAULT_TIMEZONE_RAW?.trim() || "Asia/Kolkata";
// ----------------------------------------------------------------------------------

let calendar = null;
let oAuth2Client = null;

export const ensureAuth = async () => {
  // Now using the trimmed variables
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    console.warn("⚠️ Missing Google Calendar credentials in .env");
    return false;
  }
  if (!oAuth2Client) {
    oAuth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
    );
    // Setting credentials with the trimmed refresh token
    oAuth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
    calendar = google.calendar({ version: "v3", auth: oAuth2Client });
  }
  return true;
};

// Helper to build an ISO string from date + time in a timezone-aware way.
const makeISO = (dateISO, timeHHMM, timezone) => {
  // timeHHMM = "08:00"
  if (zonedTimeToUtc) {
    // returns a Date object; convert to ISO
    return zonedTimeToUtc(`${dateISO}T${timeHHMM}:00`, timezone).toISOString();
  }
  // fallback: create a Date in the server local timezone by parsing and then convert to ISO.
  // We append "Z" to treat as UTC time to avoid environment differences.
  return new Date(`${dateISO}T${timeHHMM}:00Z`).toISOString();
};

export const getBusyForRange = async (timeMinISO, timeMaxISO) => {
  try {
    if (!(await ensureAuth())) {
      console.warn("Authentication skipped for getBusyForRange.");
      return [];
    }
    if (!calendar) return [];
    const resp = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMinISO,
        timeMax: timeMaxISO,
        items: [{ id: GOOGLE_CALENDAR_ID }],
      },
    });
    const busy = resp.data.calendars?.[GOOGLE_CALENDAR_ID]?.busy || [];
    console.log("GCAL DEBUG: busy ranges for", timeMinISO.split("T")[0], busy);
    return busy;
  } catch (err) {
    console.error("getBusyForRange error", err?.message || err);
    return [];
  }
};

export const getAvailableSlotsForDate = async (dateISO, options = {}) => {
  // Ensure authentication runs before fetching slots
  if (!(await ensureAuth())) {
    console.warn("Authentication skipped for getAvailableSlotsForDate.");
    return [];
  }

  // The timezone variable here now correctly uses the trimmed and defaulted environment variable
  const timezone = options.timezone || GOOGLE_DEFAULT_TIMEZONE;
  const templateSlots = options.templateSlots || [
    { start: "06:00", end: "07:00" },
    { start: "07:00", end: "08:00" },
    { start: "08:00", end: "09:00" },
    { start: "09:00", end: "10:00" },
    { start: "10:00", end: "11:00" },
    { start: "11:00", end: "12:00" },
    { start: "12:00", end: "13:00" },
    { start: "13:00", end: "14:00" },
    { start: "14:00", end: "15:00" },
    { start: "15:00", end: "16:00" },
    { start: "16:00", end: "17:00" },
    { start: "17:00", end: "18:00" },
    { start: "18:00", end: "19:00" },
    { start: "19:00", end: "20:00" },
    { start: "20:00", end: "21:00" },
    { start: "21:00", end: "22:00" },
  ];

  try {
    // 1. Fetch relevant context for filtering
    const centre = options.centre || null;
    const sport = options.sport || null;
    // Import Booking dynamically here to avoid circular dependency
    let Booking = null;
    try {
      Booking = (await import("../models/Booking.js")).default;
    } catch {
      Booking = null;
    }

    // 2. Mongo: get all paid bookings for this centre/date (optionally, sport)
    let bookedSlots = [];
    // Hard Normalization function defined here
    function normalizeSlotString(s) {
      return String(s || "")
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/-/g, " - ")
        .replace(/\s+-\s+/g, " - ")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (Booking && centre) {
      // Query to block **any** booking for given slot
      const query = { date: dateISO, centre };
      if (sport) query.sport = sport;
      const bookings = await Booking.find(query).select("time_slot");
      bookedSlots = bookings
        .map((b) => normalizeSlotString(b.time_slot))
        .filter(Boolean);
    }

    const dayStartUTC = makeISO(dateISO, "00:00", timezone);
    const dayEndUTC = makeISO(dateISO, "23:59:59", timezone);
    const busy = await getBusyForRange(dayStartUTC, dayEndUTC);

    const overlaps = (sISO, eISO) =>
      busy.some(
        (b) =>
          !(
            new Date(eISO) <= new Date(b.start) ||
            new Date(sISO) >= new Date(b.end)
          ),
      );

    const available = templateSlots
      .map((t) => {
        const label = normalizeSlotString(`${t.start} - ${t.end}`);
        if (!/^(\d{2}:\d{2}) - (\d{2}:\d{2})$/.test(label)) {
          console.warn("Malformed slot time label (template):", label);
          return null;
        }
        // These calls to makeISO were failing due to the untrimmed timezone variable
        const sISO = makeISO(dateISO, t.start, timezone);
        const eISO = makeISO(dateISO, t.end, timezone);
        const isSlotFree =
          !overlaps(sISO, eISO) && !bookedSlots.includes(label);
        return isSlotFree ? label : null;
      })
      .filter(Boolean);

    // Log for debugging — ensure the intersection is always empty
    console.log("[getAvailableSlotsForDate] Booked:", bookedSlots);
    console.log("[getAvailableSlotsForDate] Returned:", available);

    // dedupe & normalize formatting "HH:MM - HH:MM"
    const normalize = (s) => String(s).trim().replace(/\s+/g, " ");
    const uniq = Array.from(new Set((available || []).map(normalize)));
    return uniq;
  } catch (err) {
    console.error("getAvailableSlotsForDate error", err?.message || err);
    // fallback: return normalized template slots (no conflict checks)
    return (templateSlots || []).map((t) => `${t.start} - ${t.end}`);
  }
};

// --- REMOVED: The old, flawed getAvailableSlots function ---
// You can now rename all calls to getAvailableSlots to use getAvailableSlotsForDate

// Create a new calendar event
export const createEvent = async ({
  dateISO,
  slot,
  summary = "Booking",
  description = "",
  attendees = [],
  timezone = GOOGLE_DEFAULT_TIMEZONE,
}) => {
  await ensureAuth();
  if (!calendar) throw new Error("Google Calendar not configured");

  const [startTime, endTime] = slot.split("-").map((s) => s.trim());
  const startISO = makeISO(dateISO, startTime, timezone);
  const endISO = makeISO(dateISO, endTime, timezone);

  const event = {
    summary,
    description,
    start: { dateTime: startISO, timeZone: timezone },
    end: { dateTime: endISO, timeZone: timezone },
    attendees: (attendees || []).map((email) => ({ email })),
  };

  const res = await calendar.events.insert({
    calendarId: GOOGLE_CALENDAR_ID,
    requestBody: event,
  });

  return res.data;
};
