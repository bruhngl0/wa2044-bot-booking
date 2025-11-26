import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const WATI_API_ENDPOINT = process.env.WATI_API_ENDPOINT;
const WATI_ACCESS_TOKEN = process.env.WATI_ACCESS_TOKEN;

// Helper to make WATI API calls
const watiRequest = async (endpoint, data) => {
  try {
    const response = await axios.post(`${WATI_API_ENDPOINT}${endpoint}`, data, {
      headers: {
        Authorization: WATI_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
    });
    return response.data;
  } catch (error) {
    console.error("WATI API Error:", error.response?.data || error.message);
    throw error;
  }
};

// Send simple text message
export const sendMessage = async (to, text) => {
  return await watiRequest("/api/v1/sendSessionMessage", {
    whatsappNumber: to.replace(/\D/g, ""), // Remove any non-digits
    messageText: text,
  });
};

// Send message with buttons
export const sendButtonsMessage = async (to, bodyText, buttons) => {
  // WATI requires specific format for buttons
  const buttonData = buttons.map((btn, idx) => ({
    text: btn.title,
  }));

  return await watiRequest("/api/v1/sendInteractiveButtonsMessage", {
    whatsappNumber: to.replace(/\D/g, ""),
    callbackData: JSON.stringify(buttons.map((b) => b.id)),
    bodyText: bodyText,
    buttons: buttonData,
  });
};

// Send list message (single section)
export const sendListMessage = async (to, headerText, sections) => {
  // Transform sections to WATI format
  const listItems = sections[0].rows.map((row) => ({
    title: row.title,
    description: row.description || "",
  }));

  return await watiRequest("/api/v1/sendInteractiveListMessage", {
    whatsappNumber: to.replace(/\D/g, ""),
    header: headerText,
    body: sections[0].title || "Please select an option",
    buttonText: "View Options",
    listItems: listItems,
  });
};

// Send list message (alternative format for single item selection)
export const sendListMessageOne = async (to, bodyText, sections) => {
  const listItems = sections[0].rows.map((row) => ({
    title: row.title,
    description: row.description || "",
  }));

  return await watiRequest("/api/v1/sendInteractiveListMessage", {
    whatsappNumber: to.replace(/\D/g, ""),
    body: bodyText,
    buttonText: "Select",
    listItems: listItems,
  });
};

// Send URL button message
export const sendUrlButtonMessage = async (to, bodyText, url, buttonText) => {
  // WATI doesn't have native URL buttons, so we send text with link
  const message = `${bodyText}\n\n👉 ${buttonText}: ${url}`;
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
