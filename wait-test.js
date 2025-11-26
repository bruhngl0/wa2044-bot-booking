import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const WATI_API_ENDPOINT = process.env.WATI_API_ENDPOINT;
const WATI_ACCESS_TOKEN = process.env.WATI_ACCESS_TOKEN;
const TEST_NUMBER = "919682672622";

console.log("🔧 Testing WATI API Configuration");
console.log("Endpoint:", WATI_API_ENDPOINT);
console.log(
  "Token:",
  WATI_ACCESS_TOKEN ? `${WATI_ACCESS_TOKEN.substring(0, 20)}...` : "MISSING",
);
console.log("Test Number:", TEST_NUMBER);
console.log("---");

const testSendMessage = async () => {
  console.log("\n📤 Test 1: Sending simple text message");
  try {
    const response = await axios.post(
      // 1. URL (Correct)
      "https://live-mt-server.wati.io/1051702/api/v1/sendSessionMessage/919682672622?messageText=hey",

      // 2. Body (Correct)
      null,

      {
        // <--- 3. CONFIG OBJECT (REQUIRED!)
        headers: {
          Authorization: WATI_ACCESS_TOKEN, // <--- THIS IS THE KEY FIX
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );
    console.log(
      "✅ Success! Response:",
      JSON.stringify(response.data, null, 2),
    );
    return true;
  } catch (error) {
    console.error(
      "❌ Error:",
      error.response?.status,
      error.response?.statusText,
    );
    console.error(
      "Response data:",
      JSON.stringify(error.response?.data, null, 2),
    );
    console.error("Error message:", error.message);
    return false;
  }
};

const testSendButtons = async () => {
  console.log("\n📤 Test 2: Sending buttons message");
  try {
    const response = await axios.post(
      `${WATI_API_ENDPOINT}/api/v1/sendInteractiveButtonsMessage?whatsappNumber=919682672622`,
      {
        whatsappNumber: TEST_NUMBER,
        bodyText: "Welcome! Choose an option:",
        buttons: [{ text: "Book Court" }, { text: "View Membership" }],
      },
      {
        headers: {
          Authorization: WATI_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );
    console.log(
      "✅ Success! Response:",
      JSON.stringify(response.data, null, 2),
    );
    return true;
  } catch (error) {
    console.error(
      "❌ Error:",
      error.response?.status,
      error.response?.statusText,
    );
    console.error(
      "Response data:",
      JSON.stringify(error.response?.data, null, 2),
    );
    console.error("Error message:", error.message);
    return false;
  }
};

const testSendList = async () => {
  console.log("\n📤 Test 3: Sending list message");
  try {
    const response = await axios.post(
      `${WATI_API_ENDPOINT}/api/v1/sendInteractiveListMessage?whatsappNumber=919682672622`,
      {
        whatsappNumber: TEST_NUMBER,
        header: "Select Date",
        body: "Choose from available dates:",
        buttonText: "View Dates",
        listItems: [
          { title: "Mon, 25 Nov", description: "5 slots available" },
          { title: "Tue, 26 Nov", description: "8 slots available" },
          { title: "Wed, 27 Nov", description: "3 slots available" },
        ],
      },
      {
        headers: {
          Authorization: WATI_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );
    console.log(
      "✅ Success! Response:",
      JSON.stringify(response.data, null, 2),
    );
    return true;
  } catch (error) {
    console.error(
      "❌ Error:",
      error.response?.status,
      error.response?.statusText,
    );
    console.error(
      "Response data:",
      JSON.stringify(error.response?.data, null, 2),
    );
    console.error("Error message:", error.message);
    return false;
  }
};

const runTests = async () => {
  console.log("\n" + "=".repeat(60));
  console.log("Starting WATI API Tests");
  console.log("=".repeat(60));

  const results = {
    textMessage: await testSendMessage(),
    buttons: await testSendButtons(),
    list: await testSendList(),
  };

  console.log("\n" + "=".repeat(60));
  console.log("Test Results Summary:");
  console.log("=".repeat(60));
  console.log("Text Message:", results.textMessage ? "✅ PASS" : "❌ FAIL");
  console.log("Buttons:", results.buttons ? "✅ PASS" : "❌ FAIL");
  console.log("List:", results.list ? "✅ PASS" : "❌ FAIL");
  console.log("=".repeat(60));

  const allPassed = Object.values(results).every((r) => r);
  if (allPassed) {
    console.log(
      "\n🎉 All tests passed! WATI integration is working correctly.",
    );
  } else {
    console.log("\n⚠️ Some tests failed. Check your WATI configuration:");
    console.log("1. Verify WATI_API_ENDPOINT is correct");
    console.log("2. Verify WATI_ACCESS_TOKEN is valid and not expired");
    console.log("3. Check if the phone number is registered with WATI");
    console.log(
      "4. Ensure the WhatsApp number format is correct (with country code)",
    );
  }
};

runTests().catch(console.error);
