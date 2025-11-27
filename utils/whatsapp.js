import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

/*
=================================================
  ENV REQUIRED:
  WATI_API_ENDPOINT = https://live-mt-server.wati.io/1051702
  WATI_ACCESS_TOKEN = Bearer <yourToken>
=================================================
*/

const BASE_URL = process.env.WATI_API_ENDPOINT;
const ACCESS_TOKEN = process.env.WATI_ACCESS_TOKEN;

// ================================================
// UNIVERSAL WATI REQUEST HANDLER
// ================================================
const watiRequest = async (path, data = {}, queryParams = {}) => {
  const cleanTo =
    data?.whatsappNumber?.toString().replace(/\D/g, "") ||
    queryParams?.whatsappNumber ||
    "";

  // Build full URL
  const url = new URL(path, BASE_URL);

  // ALWAYS send whatsappNumber as query param (WATI expects this)
  if (cleanTo) {
    url.searchParams.set("whatsappNumber", cleanTo);
  }

  // Append any optional query params
  for (const key in queryParams) {
    url.searchParams.set(key, queryParams[key]);
  }

  // Send body WITHOUT whatsappNumber (WATI only accepts number in URL)
  const body = { ...data };
  delete body.whatsappNumber;

  // If no body content → send null (like sendSessionMessage test)
  const finalBody = Object.keys(body).length > 0 ? body : null;

  try {
    const response = await axios.post(url.toString(), finalBody, {
      headers: {
        Authorization: ACCESS_TOKEN, // MUST include Bearer <token>
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    return response.data;
  } catch (err) {
    console.error("❌ WATI ERROR", err.response?.data || err.message);
    throw err;
  }
};

// ================================================
// 1. SEND TEXT MESSAGE (Matches your passing test)
// ================================================
export const sendMessage = async (to, text) => {
  const cleanTo = to.replace(/\D/g, "");
  const path = `/api/v1/sendSessionMessage/${cleanTo}`;

  return await watiRequest(path, null, {
    messageText: text,
  });
};

// ================================================
// 2. SEND BUTTON MESSAGE (Matches passing test)
// ================================================
export const sendButtonsMessage = async (to, bodyText, buttons) => {
  const cleanTo = to.replace(/\D/g, "");
  const formattedButtons = buttons.map((b) => ({
    text: b.text || b.title,
  }));

  return await watiRequest(
    `/api/v1/sendInteractiveButtonsMessage`,
    {
      whatsappNumber: cleanTo,
      bodyText,
      buttons: formattedButtons,
    },
    {},
  );
};

// ================================================
// 3. SEND LIST MESSAGE (Matches passing test)
// ================================================
export const sendListMessage = async (to, header, sections) => {
  const cleanTo = to.replace(/\D/g, "");

  const listItems = sections[0].rows.map((row) => ({
    title: row.title,
    description: row.description || "",
  }));

  const bodyText = sections[0].title || "Please select an option";

  return await watiRequest(`/api/v1/sendInteractiveListMessage`, {
    whatsappNumber: cleanTo,
    header,
    body: bodyText,
    buttonText: "View Options",
    listItems,
  });
};

// ================================================
// 4. SIMPLE LIST MESSAGE (Alternative small format)
// ================================================
export const sendListMessageOne = async (to, bodyText, sections) => {
  const cleanTo = to.replace(/\D/g, "");

  const listItems = sections[0].rows.map((row) => ({
    title: row.title,
    description: row.description || "",
  }));

  return await watiRequest(`/api/v1/sendInteractiveListMessage`, {
    whatsappNumber: cleanTo,
    header: sections[0].title || "Select Option",
    body: bodyText,
    buttonText: "Select",
    listItems,
  });
};

// ================================================
// Export default for convenience
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
