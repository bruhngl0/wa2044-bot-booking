import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const WATI_API_ENDPOINT = process.env.WATI_API_ENDPOINT;
const WATI_ACCESS_TOKEN = process.env.WATI_ACCESS_TOKEN;

// Validate configuration on startup
if (!WATI_API_ENDPOINT || !WATI_ACCESS_TOKEN) {
  console.error("❌ WATI configuration missing!");
  console.error("WATI_API_ENDPOINT:", WATI_API_ENDPOINT ? "SET" : "MISSING");
  console.error("WATI_ACCESS_TOKEN:", WATI_ACCESS_TOKEN ? "SET" : "MISSING");
}

// Format phone number (remove non-digits)
const formatPhoneNumber = (phone) => {
  return phone.replace(/\D/g, "");
};

// CRITICAL: WATI uses query parameters, NOT request body for most fields!
const watiRequest = async (endpoint, queryParams = {}, bodyData = null) => {
  try {
    // Build URL with query parameters
    const params = new URLSearchParams(queryParams).toString();
    const url = `${WATI_API_ENDPOINT}${endpoint}?${params}`;

    console.log(`📡 WATI API Request: ${url}`);
    if (bodyData) {
      console.log(`📦 Body:`, JSON.stringify(bodyData, null, 2));
    }

    const response = await axios.post(url, bodyData, {
      headers: {
        Authorization: WATI_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    console.log(`✅ WATI Response:`, response.data);
    return response.data;
  } catch (error) {
    console.error("❌ WATI API Error:", {
      endpoint,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
    });
    throw error;
  }
};

// Send simple text message
export const sendMessage = async (to, text) => {
  const phone = formatPhoneNumber(to);
  console.log(`📤 Sending text to ${phone}: "${text.substring(0, 50)}..."`);

  return await watiRequest(
    `/api/v1/sendSessionMessage/${phone}`,
    { messageText: text },
    null,
  );
};

// Send message with buttons
export const sendButtonsMessage = async (to, bodyText, buttons) => {
  const phone = formatPhoneNumber(to);
  console.log(`📤 Sending buttons to ${phone}`);

  const buttonData = buttons.map((btn) => ({
    text: btn.title,
  }));

  return await watiRequest(
    `/api/v1/sendInteractiveButtonsMessage`,
    { whatsappNumber: phone },
    {
      bodyText: bodyText,
      buttons: buttonData,
    },
  );
};

// Send list message (single section)
export const sendListMessage = async (to, headerText, sections) => {
  const phone = formatPhoneNumber(to);
  console.log(`📤 Sending list to ${phone}`);

  const listItems = sections[0].rows.map((row) => ({
    title: row.title,
    description: row.description || "",
  }));

  return await watiRequest(
    `/api/v1/sendInteractiveListMessage`,
    { whatsappNumber: phone },
    {
      header: headerText,
      body: sections[0].title || "Please select an option",
      buttonText: "View Options",
      listItems: listItems,
    },
  );
};

// Send list message (alternative format)
export const sendListMessageOne = async (to, bodyText, sections) => {
  const phone = formatPhoneNumber(to);
  console.log(`📤 Sending list (single) to ${phone}`);

  const listItems = sections[0].rows.map((row) => ({
    title: row.title,
    description: row.description || "",
  }));

  return await watiRequest(
    `/api/v1/sendInteractiveListMessage`,
    { whatsappNumber: phone },
    {
      body: bodyText,
      buttonText: "Select",
      listItems: listItems,
    },
  );
};

// Send URL button message
export const sendUrlButtonMessage = async (to, bodyText, url, buttonText) => {
  const message = `${bodyText}\n\n👉 *${buttonText}*\n${url}`;
  return await sendMessage(to, message);
}; /* utils/whatsapp.js
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
