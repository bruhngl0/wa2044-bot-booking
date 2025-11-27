import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const BASE_URL = process.env.WATI_API_ENDPOINT;
const ACCESS_TOKEN = process.env.WATI_ACCESS_TOKEN;
const TEST_NUMBER = "919682672622";

console.log("=".repeat(60));
console.log("🔧 WATI API CONFIGURATION CHECK");
console.log("=".repeat(60));
console.log("BASE_URL:", BASE_URL);
console.log("TOKEN (first 30 chars):", ACCESS_TOKEN?.substring(0, 30) + "...");
console.log("TEST_NUMBER:", TEST_NUMBER);
console.log("=".repeat(60));
console.log("");

// ================================================
// TEST 1: Simple text message (what you're trying)
// ================================================
const testRealApiCall = async () => {
  console.log("📤 TEST: Sending 'hi' via real API call structure\n");

  const cleanNumber = TEST_NUMBER.replace(/\D/g, "");
  const url = `${BASE_URL}/api/v1/sendSessionMessage/${cleanNumber}?messageText=hi`;

  console.log("🔍 REQUEST DETAILS:");
  console.log("  Method: POST");
  console.log("  URL:", url);
  console.log("  Body: null");
  console.log("  Headers:", {
    Authorization: ACCESS_TOKEN?.substring(0, 30) + "...",
    "Content-Type": "application/json",
  });
  console.log("");

  try {
    const response = await axios.post(url, null, {
      headers: {
        Authorization: ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    console.log("✅ SUCCESS!");
    console.log("Response Status:", response.status);
    console.log("Response Data:", JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.log("❌ FAILED!");
    console.log("Error Status:", error.response?.status);
    console.log("Error Status Text:", error.response?.statusText);
    console.log("Error Data:", JSON.stringify(error.response?.data, null, 2));
    console.log("Error Message:", error.message);
    console.log("");

    // Additional debug info
    if (error.code === "ENOTFOUND") {
      console.log("⚠️  DNS ERROR: Cannot resolve hostname");
      console.log("   Check if BASE_URL is correct");
    } else if (error.code === "ECONNREFUSED") {
      console.log("⚠️  CONNECTION REFUSED: Server not accepting connections");
    } else if (error.response?.status === 401) {
      console.log("⚠️  UNAUTHORIZED: Token might be invalid or expired");
    } else if (error.response?.status === 404) {
      console.log("⚠️  NOT FOUND: Check URL structure and account ID");
    }

    return false;
  }
};

// ================================================
// TEST 2: Compare with your working curl
// ================================================
const testCurlEquivalent = async () => {
  console.log("\n" + "=".repeat(60));
  console.log("📤 TEST: Exact curl equivalent\n");

  const url = `${BASE_URL}/api/v1/sendSessionMessage`;
  const body = {
    whatsappNumber: TEST_NUMBER,
    messageText: "hi from curl format",
  };

  console.log("🔍 REQUEST DETAILS:");
  console.log("  Method: POST");
  console.log("  URL:", url);
  console.log("  Body:", JSON.stringify(body, null, 2));
  console.log("  Headers:", {
    Authorization: ACCESS_TOKEN?.substring(0, 30) + "...",
    "Content-Type": "application/json",
  });
  console.log("");

  try {
    const response = await axios.post(url, body, {
      headers: {
        Authorization: ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    console.log("✅ SUCCESS!");
    console.log("Response Status:", response.status);
    console.log("Response Data:", JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.log("❌ FAILED!");
    console.log("Error Status:", error.response?.status);
    console.log("Error Data:", JSON.stringify(error.response?.data, null, 2));
    return false;
  }
};

// ================================================
// TEST 3: Network connectivity check
// ================================================
const testConnectivity = async () => {
  console.log("\n" + "=".repeat(60));
  console.log("🌐 TEST: Basic connectivity to WATI server\n");

  try {
    const response = await axios.get("https://live-mt-server.wati.io", {
      timeout: 5000,
      validateStatus: () => true, // Accept any status
    });
    console.log("✅ Can reach WATI server");
    console.log("   Status:", response.status);
    return true;
  } catch (error) {
    console.log("❌ Cannot reach WATI server");
    console.log("   Error:", error.message);
    return false;
  }
};

// ================================================
// RUN ALL TESTS
// ================================================
const runAllTests = async () => {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 STARTING DIAGNOSTIC TESTS");
  console.log("=".repeat(60));
  console.log("");

  const results = {
    connectivity: await testConnectivity(),
    realApiCall: await testRealApiCall(),
    curlEquivalent: await testCurlEquivalent(),
  };

  console.log("\n" + "=".repeat(60));
  console.log("📊 TEST RESULTS SUMMARY");
  console.log("=".repeat(60));
  console.log(
    "Network Connectivity:",
    results.connectivity ? "✅ PASS" : "❌ FAIL",
  );
  console.log(
    "Real API Call Format:",
    results.realApiCall ? "✅ PASS" : "❌ FAIL",
  );
  console.log(
    "Curl Equivalent Format:",
    results.curlEquivalent ? "✅ PASS" : "❌ FAIL",
  );
  console.log("=".repeat(60));

  if (!results.connectivity) {
    console.log("\n⚠️  NETWORK ISSUE DETECTED");
    console.log("Cannot reach WATI servers. Check:");
    console.log("  1. Internet connection");
    console.log("  2. Firewall settings");
    console.log("  3. VPN/proxy configuration");
  } else if (!results.realApiCall && !results.curlEquivalent) {
    console.log("\n⚠️  AUTHENTICATION ISSUE DETECTED");
    console.log("Server is reachable but requests are failing. Check:");
    console.log("  1. WATI_ACCESS_TOKEN is correct and not expired");
    console.log("  2. Account ID (1051702) is correct");
    console.log("  3. Token has proper permissions");
  } else if (results.curlEquivalent && !results.realApiCall) {
    console.log("\n⚠️  URL FORMAT ISSUE DETECTED");
    console.log("Body format works but query param format doesn't.");
    console.log("Use the curl equivalent format in your production code.");
  } else if (results.realApiCall && results.curlEquivalent) {
    console.log("\n🎉 ALL TESTS PASSED!");
    console.log("Your WATI integration is configured correctly.");
    console.log("If you're still not seeing logs in Sevalla, the issue is");
    console.log("likely with how you're calling these functions in your app.");
  }

  console.log("");
};

runAllTests().catch(console.error);
