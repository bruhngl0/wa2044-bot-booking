import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

/*
=================================================
  REQUIRED ENV VARIABLES:
  WATI_API_ENDPOINT=https://live-mt-server.wati.io/1051702
  WATI_ACCESS_TOKEN=Bearer <your_token>
  
  Note: Token MUST include "Bearer " prefix
=================================================
*/

const BASE_URL = process.env.WATI_API_ENDPOINT;
const ACCESS_TOKEN = process.env.WATI_ACCESS_TOKEN;

// Validation on startup
if (!BASE_URL || !ACCESS_TOKEN) {
  console.error("❌ Missing WATI_API_ENDPOINT or WATI_ACCESS_TOKEN in .env");
  process.exit(1);
}

console.log(BASE_URL);
console.log(ACCESS_TOKEN);

// ================================================
// UNIVERSAL WATI REQUEST HANDLER
// ================================================
// ================================================
// UNIVERSAL WATI REQUEST HANDLER
// ================================================
const watiRequest = async (path, bodyData = null, queryParams = {}) => {
  try {
    // Build the full URL
    let url = `${BASE_URL}${path}`;

    // Add query parameters if provided
    const params = new URLSearchParams(queryParams);
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    console.log("🔍 WATI Request Debug:");
    console.log("  URL:", url);
    console.log("  Body:", JSON.stringify(bodyData, null, 2));
    console.log(
      "  Token:",
      ACCESS_TOKEN ? `${ACCESS_TOKEN.substring(0, 20)}...` : "MISSING",
    );

    const response = await axios.post(url, bodyData, {
      headers: {
        Authorization: ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    // ADD THESE DETAILED LOGS HERE 👇
    console.log("✅ WATI Response Status:", response.status);
    console.log(
      "✅ WATI Response Headers:",
      JSON.stringify(response.headers, null, 2),
    );
    console.log(
      "✅ WATI Response Data:",
      JSON.stringify(response.data, null, 2),
    );

    // Log specifically what WATI says about the message
    if (response.data) {
      console.log(
        "📱 Message Status:",
        response.data.result || response.data.status || "Unknown",
      );
      console.log(
        "📱 Message ID:",
        response.data.messageId || response.data.id || "No ID returned",
      );
      if (response.data.error) {
        console.log("⚠️ WATI Error in response:", response.data.error);
      }
    }

    return response.data;
  } catch (error) {
    console.error("❌ WATI API Error:");
    console.error("  Status:", error.response?.status);
    console.error("  StatusText:", error.response?.statusText);
    console.error("  Data:", JSON.stringify(error.response?.data, null, 2));
    console.error("  Message:", error.message);

    // ADD THIS: Log full error response
    if (error.response) {
      console.error(
        "  Full Error Response:",
        JSON.stringify(error.response, null, 2),
      );
    }

    throw error;
  }
};
// ================================================
// 1. SEND TEXT MESSAGE
// URL format: /api/v1/sendSessionMessage/NUMBER?messageText=TEXT
// Body: null (everything in URL)
// ================================================
export const sendMessage = async (to, text) => {
  const cleanTo = to.replace(/\D/g, "");
  const path = `/api/v1/sendSessionMessage/${cleanTo}`;

  return await watiRequest(path, null, { messageText: text });
};

// ================================================
// 2. SEND BUTTON MESSAGE
// URL format: /api/v1/sendInteractiveButtonsMessage?whatsappNumber=NUMBER
// Body: { bodyText, buttons }
// ================================================
// ================================================
// 2. SEND BUTTON MESSAGE
// URL format: /api/v1/sendInteractiveButtonsMessage?whatsappNumber=NUMBER
// Body: { bodyText, buttons }
// ================================================
export const sendButtonsMessage = async (to, bodyText, buttons) => {
  const cleanTo = to.replace(/\D/g, "");

  // Format buttons to match WATI schema
  const formattedButtons = buttons.map((btn, index) => ({
    text: btn.text || btn.title || btn,
    // ADD THIS: If button has an ID, preserve it, otherwise generate one
    id: btn.id || `btn_${index}`,
  }));

  const body = {
    body: bodyText,
    buttons: formattedButtons,
  };

  return await watiRequest(`/api/v1/sendInteractiveButtonsMessage`, body, {
    whatsappNumber: cleanTo,
  });
}; // ================================================
// 3. SEND LIST MESSAGE
// URL format: /api/v1/sendInteractiveListMessage?whatsappNumber=NUMBER
// Body: { header, body, buttonText, listItems }
// ================================================
export const sendListMessage = async (to, headerText, sections) => {
  const cleanTo = to.replace(/\D/g, "");

  // Extract list items from sections
  const listItems = sections[0].rows.map((row) => ({
    title: row.title,
    description: row.description || "",
  }));

  const body = {
    header: headerText,
    body: sections[0].title || "Please select an option",
    buttonText: "View Options",
    listItems: listItems,
  };

  return await watiRequest(`/api/v1/sendInteractiveListMessage`, body, {
    whatsappNumber: cleanTo,
  });
};

// ================================================
// 4. SEND LIST MESSAGE (ALTERNATIVE FORMAT)
// Same as above but with custom bodyText instead of section title
// ================================================
export const sendListMessageOne = async (to, bodyText, sections) => {
  const cleanTo = to.replace(/\D/g, "");

  const listItems = sections[0].rows.map((row) => ({
    title: row.title,
    description: row.description || "",
  }));

  const body = {
    header: sections[0].title || "Select Option",
    body: bodyText,
    buttonText: "Select",
    listItems: listItems,
  };

  return await watiRequest(`/api/v1/sendInteractiveListMessage`, body, {
    whatsappNumber: cleanTo,
  });
};

// ================================================
// EXPORT DEFAULT
// ================================================
export default {
  sendMessage,
  sendButtonsMessage,
  sendListMessage,
  sendListMessageOne,
};

/* import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const WATI_API_ENDPOINT = process.env.WATI_API_ENDPOINT;
const WATI_ACCESS_TOKEN = process.env.WATI_ACCESS_TOKEN;

// --- API Helper Function (Adjusted to allow dynamic URL construction) ---
const watiRequest = async (path, data, queryParams = {}) => {
  const cleanTo = data?.whatsappNumber?.replace(/\D/g, "") || "";

  // 1. Build the base URL
  let url = `${WATI_API_ENDPOINT}${path}`;

  // 2. Append query parameters (WATI often uses query params for the number) lol new deployment fix
  const params = new URLSearchParams(queryParams);
  if (cleanTo && !params.get("whatsappNumber")) {
    params.set("whatsappNumber", cleanTo);
  }

  if (params.toString()) {
    url += `?${params.toString()}`;
  }

  // 3. Determine the body to send (exclude number and path-specific params if in query)
  const bodyData = { ...data };
  if (bodyData.whatsappNumber) delete bodyData.whatsappNumber; // Number is in query

  // Check if body is empty, if so, send null (like in your testSendMessage)
  const finalBody = Object.keys(bodyData).length > 0 ? bodyData : null;

  try {
    const response = await axios.post(url, finalBody, {
      headers: {
        // IMPORTANT: Your test file's button/list API didn't use 'Authorization: Bearer...'
        // It only used the raw token in the header. We'll stick to that.
        Authorization: WATI_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
    });
    return response.data;
  } catch (error) {
    console.error(
      "WATI API Error:",
      error.response?.status,
      error.response?.statusText,
    );
    console.error(
      "Response data:",
      JSON.stringify(error.response?.data, null, 2),
    );
    throw error;
  }
}; 

//==========================================================================================================

// --- API Functions (Modified to match test file structure) ---

// 1. Send simple text message (Matches Test 1 using query parameters for number and text)
export const sendMessage = async (to, text) => {
  const cleanTo = to.replace(/\D/g, "");
  // URL structure from test: ".../sendSessionMessage/919682672622?messageText=hey"
  // Since WATI_API_ENDPOINT includes the account ID, we use the specific path structure.
  // NOTE: This assumes your WATI_API_ENDPOINT is just the base URL, not including the account ID.
  // If WATI_API_ENDPOINT is 'https://live-mt-server.wati.io/1051702', this works.

  const path = `/api/v1/sendSessionMessage/${cleanTo}`;

  // The body is null, and text is passed via query parameter.
  return await watiRequest(path, null, { messageText: text });
};

//=============================================================================================================================

// 2. Send message with buttons (Matches Test 2, uses query param for number and body for content)
export const sendButtonsMessage = async (to, bodyText, buttons) => {
  const cleanTo = to.replace(/\D/g, ""); // WATI buttons require a 'text' field for the label
  const buttonData = buttons.map((btn) => ({
    text: btn.title,
  }));

  const payload = {
    whatsappNumber: cleanTo, // Included in body for the watiRequest helper to extract
    bodyText: bodyText,
    buttons: buttonData,
  }; // URL structure from test: ".../sendInteractiveButtonsMessage?whatsappNumber=919682672622"

  return await watiRequest("/api/v1/sendInteractiveButtonsMessage", payload);
};

//=========================================================================================================================

// 3. Send list message (Matches Test 3, uses query param for number and body for content)
export const sendListMessage = async (to, headerText, sections) => {
  const cleanTo = to.replace(/\D/g, ""); // Transform sections to WATI listItems
  const listItems = sections[0].rows.map((row) => ({
    title: row.title,
    description: row.description || "",
  })); // The body of the message will be the section title/bodyText from the route.
  const bodyText = sections[0].title || "Please select an option";
  const payload = {
    whatsappNumber: cleanTo, // Included in body for the watiRequest helper to extract
    header: headerText,
    body: bodyText,
    buttonText: "View Options",
    listItems: listItems,
  }; // URL structure from test: ".../sendInteractiveListMessage?whatsappNumber=919682672622"
  return await watiRequest("/api/v1/sendInteractiveListMessage", payload);
};

//=======================================================================================================================

// Send list message (alternative format for single item selection)
export const sendListMessageOne = async (to, bodyText, sections) => {
  const cleanTo = to.replace(/\D/g, "");
  const listItems = sections[0].rows.map((row) => ({
    title: row.title,
    description: row.description || "",
  }));

  const payload = {
    whatsappNumber: cleanTo,
    header: sections[0].title || "Select Option", // Using section title as list header
    body: bodyText,
    buttonText: "Select",
    listItems: listItems,
  };

  return await watiRequest("/api/v1/sendInteractiveListMessage", payload);
}; */

//================================================================================================================================

// Send URL button message (WATI doesn't have native URL buttons, sticking to text + link)
export const sendUrlButtonMessage = async (to, bodyText, url, buttonText) => {
  // This function still relies on the 'sendMessage' function
  const message = `${bodyText}\n\n👉 *${buttonText}*: ${url}`;
  return await sendMessage(to, message);
};
/* utils/whatsapp.js
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const TOKEN = process.env.ACCESS_TOKEN;
const PHONE_ID = process.env.PHONE_NUMBER_ID;
const API_VER = process.env.WHATSAPP_API_VERSION || "v21.0";

const isConfigured = !!TOKEN && !!PHONE_ID;

const sendApi = async (payload) => {
  if (!isConfigured) {
    console.warn(
      "WhatsApp not configured (ACCESS_TOKEN or PHONE_NUMBER_ID missing).",
    );
    return null;
  }
  const url = `https://graph.facebook.com/${API_VER}/${PHONE_ID}/messages`;
  try {
    const resp = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    return resp.data;
  } catch (err) {
    console.error("❌ WhatsApp API error:", err.response?.data || err.message);
    throw err;
  }
};

export const sendMessage = async (to, text) => {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  };
  return sendApi(payload);
};

export const sendButtonsMessage = async (to, body, buttons) => {
  const actionButtons = buttons
    .slice(0, 3)
    .map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } }));
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: { buttons: actionButtons },
    },
  };
  return sendApi(payload);
};

// Send an interactive message with a single URL button (call-to-action)
export const sendUrlButtonMessage = async (
  to,
  body,
  url,
  title = "Pay Now",
) => {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: [
          {
            type: "url",
            url,
            title,
          },
        ],
      },
    },
  };
  return sendApi(payload);
};

export const sendListMessage = async (to, headerText, sections) => {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: headerText },
      body: { text: "Please select from the list below" },
      action: { button: "View Options", sections },
    },
  };
  return sendApi(payload);
};

// Change the signature to accept the necessary text fields
//

export const sendListMessageOne = async (to, headerText, sections) => {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: headerText },
      body: { text: "Anything else you would like to add?" },
      action: { button: "View Options", sections },
    },
  };
  return sendApi(payload);
}; */
