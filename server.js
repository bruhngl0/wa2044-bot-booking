// FILE: server.js
import express from "express";
import dotenv from "dotenv";
dotenv.config();

const getEnv = (key, defaultValue = "") => {
  return (process.env[key] || defaultValue).trim();
};

import mongoose from "mongoose";
import whatsappRoutes from "./routes/whatsapp.js";
import grit from "./routes/grit.js";
import watiTestRoutes from "./routes/watiTest.js";
import razorpayWebhookRoutes from "./routes/razorpayWebhook.js";

const app = express();

const {
  MONGO_URI,
  DB_USER,
  DB_PASS,
  DB_CLUSTER,
  DB_NAME,
  PORT = 5000,
} = process.env;

const cluster = DB_CLUSTER ? DB_CLUSTER.trim() : null;
const user = DB_USER ? DB_USER.trim() : null;
const pass = DB_PASS ? DB_PASS.trim() : null;
const name = DB_NAME ? DB_NAME.trim() : null;
let mongoConnectUri = MONGO_URI ? MONGO_URI.trim() : null; // Also trim MONGO_URI if it's set

/**
 * IMPORTANT: Register JSON/body parsers BEFORE mounting the webhook route
 * so req.rawBody is captured correctly for signature verification.
 */
app.use(
  express.json({
    verify: (req, res, buf) => {
      // keep raw buffer available for signature verification
      req.rawBody = buf;
    },
  }),
);

// support urlencoded payloads
app.use(express.urlencoded({ extended: true }));

// Request logging middleware - logs all incoming requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("Body:", JSON.stringify(req.body, null, 2));
  }
  if (req.query && Object.keys(req.query).length > 0) {
    console.log("Query:", JSON.stringify(req.query, null, 2));
  }
  next();
});

// Basic health
app.get("/", (req, res) => res.send("Booking bot running"));

// Mount WhatsApp routes - allow swapping to simple test router via env
const useWatiTestRoutes =
  (process.env.WATI_TEST_MODE || "").toLowerCase() === "true";
const activeWhatsappRouter = useWatiTestRoutes ? watiTestRoutes : grit;

if (activeWhatsappRouter) {
  app.use("/whatsapp", activeWhatsappRouter);
  console.log(
    `✅ Mounted /whatsapp routes (${useWatiTestRoutes ? "TEST" : "WATI"})`,
  );
} else {
  console.warn("⚠️ Whatsapp router not found - /whatsapp not mounted");
}

// Mount Razorpay webhook router at /razorpay (router defines /webhook)
if (razorpayWebhookRoutes) {
  app.use("/razorpay", razorpayWebhookRoutes);
  console.log("Mounted /razorpay routes");
} else {
  console.warn("⚠️ razorpayWebhookRoutes not found - /razorpay not mounted");
}

// static (optional)
app.use(express.static("public"));

// Build/Connect MongoDB only if env variables present
if (!mongoConnectUri) {
  if (user && pass && cluster && name) {
    const encPass = encodeURIComponent(pass);
    // Use the trimmed variables here
    mongoConnectUri = `mongodb+srv://${user}:${encPass}@${cluster}/${name}?retryWrites=true&w=majority`;
    console.log("Built MONGO_URI from DB_* env vars");
  } else {
    console.warn(
      "⚠️ MONGO_URI not set and DB_* parts incomplete — DB features disabled.",
    );
  }
}

if (!mongoConnectUri) {
  console.warn(
    "⚠️ MongoDB connection URI not available — DB features disabled.",
  );
} else {
  // Configure mongoose connection
  const mongooseOptions = {
    dbName: DB_NAME || "booking_bot",
    serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 10s
    socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    family: 4, // Use IPv4, skip trying IPv6
    retryWrites: true,
    w: "majority",
  };

  // Function to connect with retry logic
  const connectWithRetry = () => {
    console.log("Attempting MongoDB connection...");
    mongoose
      .connect(mongoConnectUri, mongooseOptions)
      .then(() =>
        console.log(
          "✅ MongoDB connected to database:",
          DB_NAME || "booking_bot",
        ),
      )
      .catch((err) => {
        console.error("MongoDB connection error:", err.message);
        console.log("Retrying connection in 5 seconds...");
        setTimeout(connectWithRetry, 5000);
      });
  };

  // Handle connection events
  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err);
  });

  mongoose.connection.on("disconnected", () => {
    console.log("MongoDB disconnected. Attempting to reconnect...");
    connectWithRetry();
  });

  // Initial connection
  connectWithRetry();
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
