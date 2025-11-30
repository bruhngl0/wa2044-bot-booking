import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const BASE_URL =
  process.env.WATI_API_ENDPOINT || "https://live-mt-server.wati.io/1051702";
const ACCESS_TOKEN = process.env.WATI_ACCESS_TOKEN || "Bearer YOUR_TOKEN";
const TEST_NUMBER = "919682672622";

console.log("=".repeat(70));
console.log("🔍 COMPLETE WATI SETUP DIAGNOSTIC");
console.log("=".repeat(70));

// ================================================
// TEST 1: Check if phone number is registered in WATI
// ================================================
const checkPhoneRegistration = async () => {
  console.log("\n1️⃣ Checking if phone number is registered in WATI...");

  try {
    const url = `${BASE_URL}/api/v1/getContacts`;
    const response = await axios.get(url, {
      headers: { Authorization: ACCESS_TOKEN },
    });

    const contacts = response.data.contact_list || [];

    const normalizedTestNumber = TEST_NUMBER.replace(/\D/g, "");

    const foundContact = contacts.find((c) =>
      c.wAid?.includes(normalizedTestNumber),
    );

    if (foundContact) {
      console.log("✅ Phone number IS registered in WATI");
      console.log("   Contact:", JSON.stringify(foundContact, null, 2));
      return true;
    } else {
      console.log("❌ Phone number NOT found in WATI contacts");
      console.log(`   Total contacts in system: ${contacts.length}`);
      console.log("\n   ⚠️  PROBLEM: WATI doesn't know about this number yet");
      console.log(
        "   FIX: Send a message FROM this number TO your WATI WhatsApp",
      );
      return false;
    }
  } catch (error) {
    console.log(
      "❌ Error checking contacts:",
      error.response?.data || error.message,
    );
    return false;
  }
};
// ================================================
// TEST 2: Check conversation/ticket status
// ================================================
const checkConversationStatus = async () => {
  console.log("\n2️⃣ Checking conversation/ticket status...");

  const cleanNumber = TEST_NUMBER.replace(/\D/g, "");

  try {
    const url = `${BASE_URL}/api/v1/getMessages/${cleanNumber}`;
    const response = await axios.get(url, {
      headers: { Authorization: ACCESS_TOKEN },
    });

    const ticket = response.data;

    console.log("✅ Ticket found!");
    console.log("   Ticket Status:", ticket.ticketStatus);
    console.log("   Last Message Time:", ticket.lastMessageTime);
    console.log("   Last Message From:", ticket.lastMessageFrom);

    if (ticket.ticketStatus === "BROADCAST") {
      console.log("\n   ❌ PROBLEM: Ticket is in BROADCAST mode");
      console.log("   This means:");
      console.log("   - 24-hour window has expired");
      console.log("   - OR no conversation has started yet");
      console.log("   - OR last message was more than 24 hours ago");

      const lastMsgTime = new Date(ticket.lastMessageTime);
      const now = new Date();
      const hoursSince = (now - lastMsgTime) / (1000 * 60 * 60);

      console.log(
        `\n   ⏰ Last message was ${hoursSince.toFixed(1)} hours ago`,
      );

      if (hoursSince > 24) {
        console.log("   ⚠️  Window expired - need new message from user");
      }

      return false;
    } else {
      console.log("\n   ✅ Ticket is OPEN for session messages!");
      return true;
    }
  } catch (error) {
    if (error.response?.status === 404) {
      console.log("❌ No conversation found for this number");
      console.log(
        "\n   ⚠️  PROBLEM: Number has never messaged your WATI WhatsApp",
      );
      console.log(
        "   FIX: Send a message from this number to your WATI WhatsApp",
      );
    } else {
      console.log("❌ Error:", error.response?.data || error.message);
    }
    return false;
  }
};

// ================================================
// TEST 3: Check webhook configuration
// ================================================
const checkWebhookConfig = async () => {
  console.log("\n3️⃣ Checking webhook configuration...");

  try {
    const url = `${BASE_URL}/api/v1/getWebhooks`;
    const response = await axios.get(url, {
      headers: { Authorization: ACCESS_TOKEN },
    });

    const webhooks = response.data;
    console.log("✅ Webhooks configured:");
    console.log(JSON.stringify(webhooks, null, 2));

    if (!webhooks || Object.keys(webhooks).length === 0) {
      console.log("\n   ❌ PROBLEM: No webhooks configured!");
      console.log("   FIX: Configure webhook in WATI dashboard");
      return false;
    }

    return true;
  } catch (error) {
    console.log(
      "❌ Cannot check webhooks:",
      error.response?.data || error.message,
    );
    console.log("   (This endpoint might not be available in your WATI plan)");
    return null;
  }
};

// ================================================
// TEST 4: Try to send a test message
// ================================================
const trySendingMessage = async () => {
  console.log("\n4️⃣ Attempting to send test message...");

  const cleanNumber = TEST_NUMBER.replace(/\D/g, "");
  const url = `${BASE_URL}/api/v1/sendSessionMessage/${cleanNumber}`;

  try {
    const response = await axios.post(url, null, {
      params: { messageText: "Test from diagnostic script" },
      headers: {
        Authorization: ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
    });

    console.log("✅ Message sent!");
    console.log("   Response:", JSON.stringify(response.data, null, 2));

    if (response.data.result === false) {
      console.log("\n   ⚠️  Message was accepted but not delivered");
      console.log(`   Reason: ${response.data.message}`);
      console.log(`   Status: ${response.data.ticketStatus}`);
      return false;
    }

    return true;
  } catch (error) {
    console.log("❌ Failed to send:", error.response?.data || error.message);
    return false;
  }
};

// ================================================
// TEST 5: Check WATI account configuration
// ================================================
const checkAccountConfig = async () => {
  console.log("\n5️⃣ Checking WATI account configuration...");

  try {
    // Try to get account info
    const url = `${BASE_URL}/api/v1/getProfile`;
    const response = await axios.get(url, {
      headers: { Authorization: ACCESS_TOKEN },
    });

    console.log("✅ Account info:");
    console.log("   Name:", response.data.name);
    console.log("   Phone:", response.data.phone);
    console.log("   Status:", response.data.status);

    if (response.data.status !== "ACTIVE") {
      console.log("\n   ❌ PROBLEM: Account is not ACTIVE");
      console.log("   FIX: Check WATI dashboard for account status");
      return false;
    }

    return true;
  } catch (error) {
    console.log(
      "❌ Cannot check account:",
      error.response?.data || error.message,
    );
    return null;
  }
};

// ================================================
// RUN ALL DIAGNOSTICS
// ================================================
const runCompleteDiagnostic = async () => {
  console.log("\n🔧 Configuration:");
  console.log(`   BASE_URL: ${BASE_URL}`);
  console.log(`   TOKEN: ${ACCESS_TOKEN.substring(0, 30)}...`);
  console.log(`   TEST_NUMBER: ${TEST_NUMBER}`);
  console.log("\n" + "=".repeat(70));

  const results = {
    phoneRegistered: await checkPhoneRegistration(),
    conversationOpen: await checkConversationStatus(),
    webhookConfigured: await checkWebhookConfig(),
    messageSent: await trySendingMessage(),
    accountActive: await checkAccountConfig(),
  };

  console.log("\n" + "=".repeat(70));
  console.log("📊 DIAGNOSTIC RESULTS SUMMARY");
  console.log("=".repeat(70));
  console.log(`Phone Registered:     ${results.phoneRegistered ? "✅" : "❌"}`);
  console.log(
    `Conversation Open:    ${results.conversationOpen ? "✅" : "❌"}`,
  );
  console.log(
    `Webhook Configured:   ${results.webhookConfigured === null ? "⚠️  Unknown" : results.webhookConfigured ? "✅" : "❌"}`,
  );
  console.log(`Message Sent:         ${results.messageSent ? "✅" : "❌"}`);
  console.log(
    `Account Active:       ${results.accountActive === null ? "⚠️  Unknown" : results.accountActive ? "✅" : "❌"}`,
  );
  console.log("=".repeat(70));

  // Provide specific guidance
  console.log("\n💡 DIAGNOSIS & SOLUTION:");
  console.log("=".repeat(70));

  if (!results.phoneRegistered) {
    console.log("❌ ISSUE #1: Phone number not registered in WATI");
    console.log("\n   SOLUTION:");
    console.log("   1. Open WhatsApp on your phone (919682672622)");
    console.log("   2. Find your WATI WhatsApp Business number");
    console.log("   3. Send ANY message (e.g., 'hi')");
    console.log("   4. Wait 1 minute");
    console.log("   5. Run this diagnostic again");
  }

  if (results.phoneRegistered && !results.conversationOpen) {
    console.log(
      "❌ ISSUE #2: Phone is registered but session window is closed",
    );
    console.log("\n   SOLUTION:");
    console.log(
      "   1. You (or someone with 919682672622) must send a NEW message",
    );
    console.log("   2. Check WATI dashboard to confirm message was received");
    console.log("   3. Try sending reply within 24 hours");
  }

  if (results.webhookConfigured === false) {
    console.log("❌ ISSUE #3: Webhooks not configured");
    console.log("\n   SOLUTION:");
    console.log("   1. Go to WATI Dashboard → Settings → Integrations");
    console.log("   2. Set webhook URL to your Sevalla endpoint");
    console.log("   3. Enable webhook for 'Message Received' events");
  }

  if (
    results.phoneRegistered &&
    results.conversationOpen &&
    results.messageSent
  ) {
    console.log("✅ EVERYTHING IS WORKING!");
    console.log("\n   Your WATI integration is properly configured.");
    console.log("   Messages should appear in Sevalla logs.");
    console.log("\n   If you're still not seeing logs:");
    console.log("   1. Check your webhook URL is correct");
    console.log("   2. Verify Sevalla is receiving requests");
    console.log("   3. Check WATI dashboard for delivery status");
  }

  console.log("\n" + "=".repeat(70));
};

runCompleteDiagnostic().catch(console.error);
