import dotenv from "dotenv";
dotenv.config();

// Helper to get and trim env vars
const getEnv = (key, defaultValue = "") => {
  return (process.env[key] || defaultValue).trim();
};

export const config = {
  // Server
  port: getEnv("PORT", "5000"),
  baseUrl: getEnv("BASE_URL"),

  // WhatsApp
  verifyToken: getEnv("VERIFY_TOKEN"),
  accessToken: getEnv("ACCESS_TOKEN"),
  phoneNumberId: getEnv("PHONE_NUMBER_ID"),
  testNumber: getEnv("TEST_NUMBER"),
  whatsappApiVersion: getEnv("WHATSAPP_API_VERSION", "v21.0"),

  // Database
  mongoUri: getEnv("MONGO_URI"),

  // Google Calendar
  google: {
    clientId: getEnv("GOOGLE_CLIENT_ID"),
    clientSecret: getEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: getEnv("GOOGLE_REDIRECT_URI"),
    refreshToken: getEnv("GOOGLE_REFRESH_TOKEN"),
    timezone: getEnv("GOOGLE_DEFAULT_TIMEZONE", "Asia/Kolkata"),
    calendarId: getEnv("GOOGLE_CALENDAR_ID", "primary"),
  },

  // Razorpay
  razorpay: {
    keyId: getEnv("RAZORPAY_KEY_ID"),
    keySecret: getEnv("RAZORPAY_KEY_SECRET"),
    webhookSecret: getEnv("RAZORPAY_WEBHOOK_SECRET"),
  },
};
