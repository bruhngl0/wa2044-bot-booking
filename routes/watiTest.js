import express from "express";

const router = express.Router();

// Simple health check for quick verification
router.get("/", (req, res) => {
  res.status(200).json({
    ok: true,
    message: "WATI test webhook active",
    timestamp: new Date().toISOString(),
  });
});

// Echo incoming payloads for debugging
router.post("/", (req, res) => {
  const timestamp = new Date().toISOString();
  console.log("=== WATI TEST WEBHOOK ===");
  console.log("Timestamp:", timestamp);
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Query:", JSON.stringify(req.query, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));

  res.status(200).json({
    ok: true,
    message: "Payload received",
    timestamp,
  });
});

export default router;

