require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const cron = require('node-cron');

console.log("🔑 Loaded WhatsApp Token Prefix:", process.env.WHATSAPP_ACCESS_TOKEN ? process.env.WHATSAPP_ACCESS_TOKEN.substring(0, 14) + "..." : "❌ NO TOKEN LOADED");
console.log("🤖 Loaded Gemini API Key Prefix:", process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) + "..." : "❌ NO GEMINI KEY LOADED");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname))); // Serve static frontend files (HTML/CSS/JS)

// Enable CORS for Frontend Dashboard
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-tenant-id');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_FEMALE_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah (Soft Neutral Female)
const DEFAULT_SANDBOX_PASSKEY = "bfb279f9aa9bdbaca158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";

// ==========================================
// 1. MULTI-TENANT PERSISTENT DATABASE STORE
// ==========================================
const DB_FILE = path.join(__dirname, 'multi_tenant_store.json');

function initializeStore() {
  let loadedStore = null;
  if (fs.existsSync(DB_FILE)) {
    try {
      loadedStore = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      console.warn("⚠️ Reinitializing database store.");
    }
  }

  if (!loadedStore) {
    loadedStore = {
      tenants: {
        "luvon_q_flagship": {
          id: "luvon_q_flagship",
          businessName: "Luvon Q Flagship",
          brandSignature: "Luvon Q Orélune",
          industry: "Luxury Boutique, Footwear & Wellness",
          tone: "luxury_chic",
          languagePreference: "mirror_user",
          elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID || DEFAULT_FEMALE_VOICE_ID,
          escalationPhone: process.env.AGENT_PHONE_NUMBER || "254768820142",
          whatsappPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID || "1279716021891578",
          instagramPageId: null,
          daraja: {
            type: "CustomerPayBillOnline",
            shortcode: String(process.env.DARAJA_BUSINESS_SHORTCODE || "174379").trim(),
            passkey: DEFAULT_SANDBOX_PASSKEY,
            consumerKey: String(process.env.DARAJA_CONSUMER_KEY || "").trim(),
            consumerSecret: String(process.env.DARAJA_CONSUMER_SECRET || "").trim()
          },
          catalog: [
            {
              id: '1',
              name: 'Air Force 1 White',
              price: 2500,
              stock: 4,
              category: 'Shoes',
              tags: ['sneakers', 'nike', 'shoes', 'footwear', 'white shoes', 'airforce'],
              hasImage: true,
              imageUrl: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800'
            },
            {
              id: '2',
              name: 'Knotless Braids Service',
              price: 1500,
              stock: 10,
              category: 'Salon',
              tags: ['braids', 'knotless', 'hair', 'hair styling', 'salon', 'plaits', 'box braids'],
              hasImage: true,
              imageUrl: 'https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?w=800'
            },
            {
              id: '3',
              name: 'Leather Shoulder Bag',
              price: 3200,
              stock: 2,
              category: 'Boutique',
              tags: ['bag', 'handbag', 'leather', 'accessories', 'purse'],
              hasImage: true,
              imageUrl: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800'
            },
            {
              id: '4',
              name: 'Swedish Deep Tissue Massage',
              price: 3000,
              stock: 5,
              category: 'Spa',
              tags: ['massage', 'deep tissue', 'relaxation', 'swedish', 'back pain', 'stress relief'],
              hasImage: false,
              imageUrl: null
            }
          ]
        }
      },
      crmProfiles: {},
      orders: {},
      attributionLedger: [],
      processedMessageIds: []
    };
  }

  if (loadedStore.tenants["luvon_q_flagship"]) {
    const flagship = loadedStore.tenants["luvon_q_flagship"];
    flagship.whatsappPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || "1279716021891578";

    if (!flagship.elevenLabsVoiceId || flagship.elevenLabsVoiceId === "JBFqnCBsd6RMkjVDRZzb") {
      flagship.elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_FEMALE_VOICE_ID;
    }

    flagship.daraja = {
      type: "CustomerPayBillOnline",
      shortcode: String(process.env.DARAJA_BUSINESS_SHORTCODE || "174379").trim(),
      passkey: DEFAULT_SANDBOX_PASSKEY,
      consumerKey: String(process.env.DARAJA_CONSUMER_KEY || "").trim(),
      consumerSecret: String(process.env.DARAJA_CONSUMER_SECRET || "").trim()
    };
  }

  return loadedStore;
}

let db = initializeStore();

function saveStore() {
  try {
    db.processedMessageIds = (db.processedMessageIds || []).slice(-2000);
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error("❌ Failed to save database:", e.message);
  }
}

function resolveTenant(channelId) {
  if (!channelId) return db.tenants["luvon_q_flagship"];
  for (const tenant of Object.values(db.tenants)) {
    if (tenant.whatsappPhoneId === channelId || tenant.instagramPageId === channelId) {
      return tenant;
    }
  }
  return db.tenants["luvon_q_flagship"];
}

// ==========================================
// 2. DARAJA TOKEN CACHE & RESILIENT STK PUSH
// ==========================================
let cachedDarajaToken = null;
let tokenExpiryTime = 0;

function getValidDarajaCredentials(tenant) {
  let key = (process.env.DARAJA_CONSUMER_KEY || tenant?.daraja?.consumerKey || "").trim();
  let secret = (process.env.DARAJA_CONSUMER_SECRET || tenant?.daraja?.consumerSecret || "").trim();
  let passkey = (process.env.DARAJA_PASSKEY || tenant?.daraja?.passkey || DEFAULT_SANDBOX_PASSKEY).trim();
  let shortcode = String(process.env.DARAJA_BUSINESS_SHORTCODE || tenant?.daraja?.shortcode || "174379").trim();

  if (passkey.includes('bdbcf') || passkey.length < 30) {
    passkey = DEFAULT_SANDBOX_PASSKEY;
  }

  return { key, secret, passkey, shortcode };
}

async function getTenantDarajaToken(tenant, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedDarajaToken && now < tokenExpiryTime) {
    return cachedDarajaToken;
  }

  const { key, secret } = getValidDarajaCredentials(tenant);
  if (!key || !secret) {
    throw new Error("Missing Daraja Consumer Key or Secret");
  }

  const auth = Buffer.from(`${key}:${secret}`).toString('base64');

  console.log("🔄 Requesting Daraja OAuth Token from Safaricom...");
  const response = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
    headers: {
      Authorization: `Basic ${auth}`
    },
    timeout: 20000
  });

  cachedDarajaToken = response.data.access_token;
  const expiresIn = Number(response.data.expires_in || 3599);
  tokenExpiryTime = now + (expiresIn - 60) * 1000;

  console.log("🔑 Daraja OAuth Token Acquired Successfully.");
  return cachedDarajaToken;
}

async function executeDarajaSTK(tenant, phoneNumber, amount, itemRef, isRetry = false) {
  try {
    const { passkey, shortcode } = getValidDarajaCredentials(tenant);
    const token = await getTenantDarajaToken(tenant, isRetry);

    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    const cleanPhone = phoneNumber.toString().replace(/\+/g, '').trim();

    let txType = "CustomerPayBillOnline";
    if (shortcode !== "174379" && tenant.daraja?.type === "CustomerBuyGoodsOnline") {
      txType = "CustomerBuyGoodsOnline";
    }

    let serverUrl = process.env.SERVER_URL || 'https://sandbox.safaricom.co.ke';
    if (serverUrl.includes('localhost') || !serverUrl.startsWith('http')) {
      serverUrl = 'https://sandbox.safaricom.co.ke';
    }
    const callbackUrl = `${serverUrl.replace(/\/$/, '')}/api/stk-callback`;

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: txType,
      Amount: Math.max(1, Math.round(Number(amount) || 1)),
      PartyA: cleanPhone,
      PartyB: shortcode,
      PhoneNumber: cleanPhone,
      CallBackURL: callbackUrl,
      AccountReference: (itemRef || tenant.businessName || "LuvonQ").substring(0, 12),
      TransactionDesc: `Pay for ${itemRef || "Item"}`
    };

    console.log(`📤 Dispatching Daraja STK Push [${shortcode} | ${txType}] to +${cleanPhone}...`);

    const res = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 25000
      }
    );

    console.log(`✅ STK Push Handshake Successful [${tenant.businessName}]:`, res.data);
    return res.data;
  } catch (err) {
    let errorDetails = err.response?.data || { errorMessage: err.message };

    if (!isRetry && (err.response?.status === 401 || err.response?.status === 500 || err.code === 'ECONNABORTED' || JSON.stringify(errorDetails).includes('Wrong credentials'))) {
      console.warn("⚠️ Gateway handshake issue detected. Refreshing token and retrying in 1.2s...");
      cachedDarajaToken = null;
      await sleep(1200);
      return await executeDarajaSTK(tenant, phoneNumber, amount, itemRef, true);
    }

    if (typeof errorDetails === 'string' && errorDetails.includes('Incapsula')) {
      errorDetails = { errorMessage: "Safaricom Gateway Rate Limited / WAF Blocked. Please wait 30 seconds." };
    }

    console.error(`❌ STK Push Failed [${tenant.businessName}]:`, JSON.stringify(errorDetails));
    return { error: true, details: errorDetails };
  }
}

async function triggerTenantSTKPush(tenant, phoneNumber, amount, itemRef) {
  return await executeDarajaSTK(tenant, phoneNumber, amount, itemRef, false);
}

// ==========================================
// 3. GEMINI 3.7 FLASH INSTRUCTION ENGINE
// ==========================================
function buildTenantSystemInstruction(tenant, profile) {
  return `
You are the dedicated female AI sales & style concierge for **${tenant.businessName}**${
    tenant.brandSignature ? ` (Brand Signature: *${tenant.brandSignature}*)` : ''
  }, an elite ${tenant.industry} house in Nairobi.
Powered by: Luvon Q Orélune Conversational Engine.

Current Customer Stage: ${(profile.stage || 'QUALIFICATION').toUpperCase()}
Customer Context: ${JSON.stringify(profile)}
Live Catalog:
${JSON.stringify(tenant.catalog, null, 2)}

BRAND VOICE & PERSONA:
- Archetype Tone: ${tenant.tone.toUpperCase().replace('_', ' ')}
- Persona: Warm, charming, confident Kenyan female host.
- Language Policy:
  * If customer uses Sheng (e.g., "Kaende kaende", "Niaje", "Form ni gani"), reply warmly and naturally in authentic Sheng!
  * If customer uses English or Swahili, mirror their vocabulary and elegance seamlessly.
- Length: 1 to 3 concise, punchy, conversational sentences.

CORE OPERATING DIRECTIVES:
1. TASK-ORIENTED: Guide inquiries directly toward product exploration, booking consultations, or checkout.
2. STOCK SAFETY: Never sell or initiate payment for items with stock <= 0.
3. CLEAR PRICING: State prices clearly in Kenyan Shillings (KSh).

STRUCTURED JSON ACTIONS (STRICT FORMAT ONLY WHEN TRIGGERED):
- ACTION 1: SEND IMAGE (Only if customer explicitly asks to see photo AND hasImage is true)
  {"action": "SEND_IMAGE", "itemId": "1", "caption": "..."}

- ACTION 2: INITIATE M-PESA CHECKOUT (When customer confirms intent to pay/buy)
  {"action": "STK_PUSH", "itemId": "1", "amount": 2500, "item": "Air Force 1 White"}

- ACTION 3: HUMAN HANDOFF (Manager requested, custom consultation, or heavy bargaining)
  {"action": "HUMAN_HANDOFF", "reason": "..."}

If no action is triggered, output conversational prose.
`.trim();
}

async function generateGeminiSalesResponse(tenant, profile, newParts) {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  // Build conversational history contents
  const contents = [];
  const history = profile.conversationHistory || [];

  for (const turn of history.slice(-10)) {
    contents.push({
      role: turn.role === 'model' ? 'model' : 'user',
      parts: [{ text: turn.text }]
    });
  }

  // Append new user turn parts
  contents.push({
    role: 'user',
    parts: newParts
  });

  const requestBody = {
    contents,
    systemInstruction: {
      parts: [{ text: buildTenantSystemInstruction(tenant, profile) }]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 800
    }
  };

  // ✅ TARGETING GEMINI 3.7 FLASH DIRECTLY
  const models = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
  let lastError = null;

  for (const model of models) {
    try {
      console.log(`🤖 Invoking ${model}...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const response = await axios.post(url, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        timeout: 25000
      });

      const candidateText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (candidateText) {
        return candidateText.trim();
      }
    } catch (err) {
      lastError = err.response?.data || err.message;
      console.warn(`⚠️ Model [${model}] attempt notice:`, JSON.stringify(lastError));
    }
  }

  throw new Error(`Gemini generation failed: ${JSON.stringify(lastError)}`);
}

function getOrCreateCustomerSession(tenant, customerId, channel = 'whatsapp') {
  const sessionKey = `${tenant.id}_${customerId}`;
  let profile = db.crmProfiles[sessionKey];

  if (!profile) {
    profile = {
      tenantId: tenant.id,
      customerId,
      channel,
      stage: 'QUALIFICATION',
      cart: null,
      isPaused: false,
      lastInteraction: new Date().toISOString(),
      conversationHistory: []
    };
    db.crmProfiles[sessionKey] = profile;
    saveStore();
  }

  profile.lastInteraction = new Date().toISOString();
  return { profile, sessionKey };
}

// ==========================================
// 4. ELEVENLABS AUDIO DISPATCH
// ==========================================
async function sendWhatsAppElevenLabsAudio(tenant, toPhone, textReply) {
  if (!toPhone || !textReply) return;
  const cleanPhone = toPhone.toString().replace(/\+/g, '').trim();
  const cleanSpeech = textReply.replace(/[*_~`#]/g, '').trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || tenant.whatsappPhoneId || "1279716021891578";

  try {
    const voiceId = tenant.elevenLabsVoiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_FEMALE_VOICE_ID;
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) return;

    console.log(`🎙️ Generating ElevenLabs Voice Note via [${voiceId}] (Female)...`);

    const ttsRes = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        text: cleanSpeech,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true }
      },
      {
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        responseType: 'arraybuffer'
      }
    );

    const form = new FormData();
    form.append('file', Buffer.from(ttsRes.data), { filename: 'voice_note.mp3', contentType: 'audio/mpeg' });
    form.append('type', 'audio/mpeg');
    form.append('messaging_product', 'whatsapp');

    const uploadRes = await axios.post(
      `https://graph.facebook.com/v18.0/${phoneId}/media`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`
        }
      }
    );

    await axios.post(
      `https://graph.facebook.com/v18.0/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'audio',
        audio: { id: uploadRes.data.id }
      },
      { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` } }
    );
    console.log(`✅ Female Voice Note delivered to +${cleanPhone}`);
  } catch (err) {
    console.warn('⚠️ ElevenLabs generation notice:', err.response?.data ? JSON.stringify(err.response.data) : err.message);
  }
}

// ==========================================
// 5. MESSAGING UTILITIES
// ==========================================
async function markMessageAsRead(messageId) {
  if (!messageId) return;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || "1279716021891578";
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${phoneId}/messages`,
      { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
      { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` } }
    );
    console.log(`👁️ Marked read: ${messageId}`);
  } catch (e) {}
}

async function sendWhatsAppText(tenant, toPhone, text) {
  if (!toPhone || !text) return;
  const cleanPhone = toPhone.toString().replace(/\+/g, '').trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || tenant.whatsappPhoneId || "1279716021891578";

  try {
    const res = await axios.post(
      `https://graph.facebook.com/v18.0/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'text',
        text: { body: String(text).trim() }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`📤 Text reply delivered to +${cleanPhone}: "${String(text).trim().substring(0, 45)}..." (ID: ${res.data?.messages?.[0]?.id})`);
  } catch (err) {
    console.error('❌ Meta Outbound Send Error:', JSON.stringify(err.response?.data || err.message));
  }
}

async function sendWhatsAppImage(tenant, toPhone, imageUrl, caption) {
  if (!toPhone || !imageUrl) return;
  const cleanPhone = toPhone.toString().replace(/\+/g, '').trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || tenant.whatsappPhoneId || "1279716021891578";

  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'image',
        image: { link: imageUrl, caption: caption || '' }
      },
      { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` } }
    );
    console.log(`📷 Image sent to +${cleanPhone}`);
  } catch (err) {
    console.error('❌ Failed to send image:', err.response?.data || err.message);
  }
}

async function getMediaBuffer(mediaId) {
  try {
    const resUrl = await axios.get(
      `https://graph.facebook.com/v18.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` } }
    );
    const mediaRes = await axios.get(resUrl.data.url, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
      responseType: 'arraybuffer'
    });
    return {
      buffer: Buffer.from(mediaRes.data).toString('base64'),
      mimeType: resUrl.data.mime_type || 'application/octet-stream'
    };
  } catch (err) {
    console.error('❌ Media download failed:', err.message);
    return null;
  }
}

// ==========================================
// 6. MAIN WEBHOOK INTAKE & DUAL DISPATCH
// ==========================================
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully!');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const message = changes?.messages?.[0];
    if (!message) return;

    if (db.processedMessageIds.includes(message.id)) return;
    db.processedMessageIds.push(message.id);
    saveStore();

    const incomingPhoneId = changes?.metadata?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID;
    const tenant = resolveTenant(incomingPhoneId);

    const rawFrom = message.from;
    const fromNumber = rawFrom.startsWith('+') ? rawFrom.slice(1) : rawFrom;
    const msgType = message.type;

    const incomingTextRaw = (msgType === 'text' && message.text?.body) ? message.text.body : '';
    const requestsVoice = /\b(read|voice|audio|say|listen|loud|driving|record|ongea)\b/i.test(incomingTextRaw);
    const isVoiceInput = (msgType === 'audio' || msgType === 'voice' || requestsVoice);

    console.log(`📩 Processing message from +${fromNumber} (Type: ${msgType}, VoiceTrigger: ${isVoiceInput}) via PhoneID [${incomingPhoneId}]`);

    const { profile } = getOrCreateCustomerSession(tenant, fromNumber, 'whatsapp');

    if (msgType === 'text') {
      const incomingText = incomingTextRaw.trim().toLowerCase();
      if (/^\/?unpa(u|s)e(\s.*)?$/i.test(incomingText)) {
        profile.isPaused = false;
        saveStore();
        await sendWhatsAppText(tenant, fromNumber, "Niko back! How can I help you?");
        return;
      }
    }

    if (profile.isPaused) {
      console.log(`⏸️ Chat with ${fromNumber} is paused.`);
      return;
    }

    await markMessageAsRead(message.id);

    let userPromptParts = [];
    let loggedUserText = "";

    if (msgType === 'text') {
      loggedUserText = incomingTextRaw;
      userPromptParts.push({ text: loggedUserText });
      console.log(`💬 [${tenant.businessName}] Received: "${loggedUserText}"`);
    } else if (msgType === 'image') {
      const caption = message.image.caption || "Customer uploaded a photo.";
      loggedUserText = `[Sent Image: ${caption}]`;
      const mediaData = await getMediaBuffer(message.image.id);
      if (mediaData) {
        userPromptParts.push({ inlineData: { data: mediaData.buffer, mimeType: mediaData.mimeType } });
      }
      userPromptParts.push({ text: caption });
    } else if (msgType === 'audio' || msgType === 'voice') {
      loggedUserText = `[Sent Voice Note]`;
      const audioId = message.audio?.id || message.voice?.id;
      const mediaData = await getMediaBuffer(audioId);
      if (mediaData) {
        userPromptParts.push({
          inlineData: {
            data: mediaData.buffer,
            mimeType: mediaData.mimeType.includes('ogg') ? 'audio/ogg' : mediaData.mimeType
          }
        });
        userPromptParts.push({ text: "Listen to this customer's voice note and respond naturally as a warm female sales concierge in their language (English, Swahili, or Sheng)." });
      }
    }

    console.log(`🤖 Generating Gemini sales response (gemini-3.7-flash)...`);
    let responseText = await generateGeminiSalesResponse(tenant, profile, userPromptParts);

    if (!responseText) {
      responseText = `Karibu ${tenant.businessName}! How can I help you today?`;
    }

    profile.conversationHistory.push(
      { role: 'user', text: loggedUserText, timestamp: new Date().toISOString() },
      { role: 'model', text: responseText, timestamp: new Date().toISOString() }
    );
    saveStore();

    await sleep(500);

    if (responseText.includes('SEND_IMAGE')) {
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*"action"\s*:\s*"SEND_IMAGE"[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);

        let item = null;
        if (parsed.itemId) {
          item = tenant.catalog.find(i => String(i.id) === String(parsed.itemId));
        }
        if (!item && parsed.item) {
          const search = String(parsed.item).toLowerCase();
          item = tenant.catalog.find(i => i.name.toLowerCase().includes(search) || (i.tags && i.tags.some(t => search.includes(t))));
        }

        if (item && item.hasImage && item.imageUrl) {
          const caption = parsed.caption || `Cheki *${item.name}* (KSh ${item.price}).`;
          await sendWhatsAppImage(tenant, fromNumber, item.imageUrl, caption);
          if (isVoiceInput) await sendWhatsAppElevenLabsAudio(tenant, fromNumber, caption);
        } else {
          const noPicMsg = "Hatuna picha ya hiyo kwa sasa, but I can share all details or help you book it!";
          await sendWhatsAppText(tenant, fromNumber, noPicMsg);
          if (isVoiceInput) await sendWhatsAppElevenLabsAudio(tenant, fromNumber, noPicMsg);
        }
      } catch (err) {
        const fallbackMsg = "Form ni gani! Let me know which catalog item you'd like to check out.";
        await sendWhatsAppText(tenant, fromNumber, fallbackMsg);
        if (isVoiceInput) await sendWhatsAppElevenLabsAudio(tenant, fromNumber, fallbackMsg);
      }

    } else if (responseText.includes('HUMAN_HANDOFF')) {
      profile.isPaused = true;
      saveStore();

      const handoffMsg = `Give me one second! Let me connect you directly to our manager at ${tenant.businessName}.`;
      await sendWhatsAppText(tenant, fromNumber, handoffMsg);
      if (isVoiceInput) await sendWhatsAppElevenLabsAudio(tenant, fromNumber, handoffMsg);

      let reason = "Customer requested human consultation";
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*"action"\s*:\s*"HUMAN_HANDOFF"[\s\S]*\}/);
        if (jsonMatch) reason = JSON.parse(jsonMatch[0]).reason || reason;
      } catch (e) {}

      if (tenant.escalationPhone) {
        const summary = `• Stage: ${profile.stage}\n• Reason: ${reason}`;
        const alertPayload = `🚨 *HUMAN HANDOFF ALERT [${tenant.businessName}]*\nCustomer: +${fromNumber}\n\n*SUMMARY:*\n${summary}\n\nSend */unpause* to resume AI.`;
        await sendWhatsAppText(tenant, tenant.escalationPhone, alertPayload);
      }

    } else if (responseText.includes('STK_PUSH')) {
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*"action"\s*:\s*"STK_PUSH"[\s\S]*\}/);
        const paymentData = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);

        const item = tenant.catalog.find(i => i.name.toLowerCase().includes(paymentData.item.toLowerCase()) || String(i.id) === String(paymentData.itemId));
        if (item && item.stock <= 0) {
          const outOfStockMsg = `Pole sana! *${item.name}* is currently out of stock.`;
          await sendWhatsAppText(tenant, fromNumber, outOfStockMsg);
          if (isVoiceInput) await sendWhatsAppElevenLabsAudio(tenant, fromNumber, outOfStockMsg);
          return;
        }

        profile.stage = 'CLOSING';
        profile.cart = {
          item: paymentData.item,
          amount: paymentData.amount,
          imageUrl: (item && item.hasImage) ? item.imageUrl : null,
          timestamp: new Date().toISOString()
        };
        saveStore();

        if (profile.cart.imageUrl) {
          await sendWhatsAppImage(tenant, fromNumber, profile.cart.imageUrl, `🛒 *${paymentData.item}* — KSh ${paymentData.amount}`);
        }

        const promptMsg = `Sending the M-Pesa prompt for KSh ${paymentData.amount} right now. Check your phone to enter your PIN!`;
        await sendWhatsAppText(tenant, fromNumber, promptMsg);
        if (isVoiceInput) await sendWhatsAppElevenLabsAudio(tenant, fromNumber, promptMsg);

        const stkResult = await triggerTenantSTKPush(tenant, fromNumber, paymentData.amount, paymentData.item);
        if (stkResult?.CheckoutRequestID) {
          db.orders[stkResult.CheckoutRequestID] = {
            tenantId: tenant.id,
            phone: fromNumber,
            item: paymentData.item,
            amount: paymentData.amount,
            timestamp: new Date().toISOString()
          };
          saveStore();
        }
      } catch (jsonErr) {
        await sendWhatsAppText(tenant, fromNumber, responseText);
        if (isVoiceInput) await sendWhatsAppElevenLabsAudio(tenant, fromNumber, responseText);
      }

    } else {
      await sendWhatsAppText(tenant, fromNumber, responseText);
      if (isVoiceInput) {
        await sendWhatsAppElevenLabsAudio(tenant, fromNumber, responseText);
      }
    }

  } catch (err) {
    console.error('❌ Webhook Processing Error:', err.message);
  }
});

// ==========================================
// 7. M-PESA DARAJA CALLBACK WEBHOOK
// ==========================================
app.post('/api/stk-callback', async (req, res) => {
  res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

  try {
    const callbackData = req.body?.Body?.stkCallback;
    if (!callbackData) return;

    const checkoutReqId = callbackData.CheckoutRequestID;
    const resultCode = callbackData.ResultCode;
    const savedOrder = db.orders[checkoutReqId];

    if (!savedOrder) return;
    const tenant = db.tenants[savedOrder.tenantId] || db.tenants["luvon_q_flagship"];
    const metadata = callbackData.CallbackMetadata?.Item;
    const phone = metadata?.find(i => i.Name === 'PhoneNumber')?.Value || savedOrder.phone;

    if (resultCode === 0 && phone) {
      const receipt = metadata?.find(i => i.Name === 'MpesaReceiptNumber')?.Value || 'MPESA_VERIFIED';
      const amount = Number(metadata?.find(i => i.Name === 'Amount')?.Value || savedOrder.amount || 0);
      const purchasedItem = savedOrder.item || "Catalog Item";

      const catalogItem = tenant.catalog.find(i => i.name.toLowerCase() === purchasedItem.toLowerCase());
      if (catalogItem && catalogItem.stock > 0) {
        catalogItem.stock -= 1;
      }

      db.attributionLedger.push({
        tenantId: tenant.id,
        phone,
        amount,
        item: purchasedItem,
        receipt,
        channel: 'WhatsApp_AI_Agent',
        timestamp: new Date().toISOString()
      });

      const sessionKey = `${tenant.id}_${phone}`;
      if (db.crmProfiles[sessionKey]) {
        db.crmProfiles[sessionKey].stage = 'POST_PURCHASE';
        db.crmProfiles[sessionKey].cart = null;
      }

      delete db.orders[checkoutReqId];
      saveStore();

      const confMsg = `✅ *Payment Confirmed!*\n\nTumepokea *KSh ${amount}* (Receipt: *${receipt}*).\n\nThank you for choosing *${tenant.businessName}*!`;
      await sendWhatsAppText(tenant, phone, confMsg);
    } else if (phone && savedOrder) {
      delete db.orders[checkoutReqId];
      saveStore();
      await sendWhatsAppText(
        tenant,
        phone,
        `No problem at all! Your order for *${savedOrder.item}* (KSh ${savedOrder.amount}) is saved. Whenever you're ready, reply *PAY*.`
      );
    }
  } catch (err) {
    console.error('❌ Callback error:', err.message);
  }
});

// ==========================================
// 8. REST API FOR FRONTEND DASHBOARD
// ==========================================
function tenantMiddleware(req, res, next) {
  const tenantId = req.headers['x-tenant-id'] || 'luvon_q_flagship';
  req.tenant = db.tenants[tenantId];
  if (!req.tenant) return res.status(404).json({ error: "Tenant not found" });
  next();
}

app.get('/api/tenant/settings', tenantMiddleware, (req, res) => {
  res.json({
    success: true,
    tenant: req.tenant,
    availableVoices: [
      { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah (Soft & Professional Female)", gender: "Female" },
      { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice (Expressive & Natural Female)", gender: "Female" },
      { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura (Warm & Upbeat Female)", gender: "Female" },
      { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica (Expressive Concierge Female)", gender: "Female" },
      { id: "JBFqnCBsd6RMkjVDRZzb", name: "George (British Male)", gender: "Male" }
    ]
  });
});

app.get('/api/tenant/metrics', tenantMiddleware, (req, res) => {
  const tenantSales = db.attributionLedger.filter(t => t.tenantId === req.tenant.id);
  const totalRevenue = tenantSales.reduce((sum, t) => sum + t.amount, 0);
  const activeChats = Object.values(db.crmProfiles).filter(p => p.tenantId === req.tenant.id);

  res.json({
    totalRevenue,
    dealsClosed: tenantSales.length,
    activeCustomers: activeChats.length,
    catalogItems: req.tenant.catalog.length,
    recentSales: tenantSales.slice(-10)
  });
});

app.get('/api/tenant/inventory', tenantMiddleware, (req, res) => {
  res.json(req.tenant.catalog || []);
});

app.post('/api/tenant/inventory', tenantMiddleware, (req, res) => {
  const { name, price, stock, category, tags, hasImage, imageUrl } = req.body;
  const newItem = {
    id: String(Date.now()),
    name,
    price: Number(price),
    stock: Number(stock || 0),
    category: category || "General",
    tags: tags || [],
    hasImage: Boolean(hasImage),
    imageUrl: imageUrl || null
  };
  req.tenant.catalog.push(newItem);
  saveStore();
  res.status(201).json(newItem);
});

app.post('/api/tenant/settings/personality', tenantMiddleware, (req, res) => {
  const { tone, elevenLabsVoiceId, escalationPhone, languagePreference, businessName } = req.body;
  if (tone) req.tenant.tone = tone;
  if (elevenLabsVoiceId) req.tenant.elevenLabsVoiceId = elevenLabsVoiceId;
  if (escalationPhone) req.tenant.escalationPhone = escalationPhone;
  if (languagePreference) req.tenant.languagePreference = languagePreference;
  if (businessName) req.tenant.businessName = businessName;
  saveStore();
  console.log(`🎛️ Settings updated for [${req.tenant.businessName}]: Voice ID = ${req.tenant.elevenLabsVoiceId}, Tone = ${req.tenant.tone}`);
  res.json({ success: true, tenant: req.tenant });
});

app.post('/api/tenant/voice/preview', async (req, res) => {
  const { voiceId, text } = req.body;
  const targetVoice = voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_FEMALE_VOICE_ID;
  const sampleText = text || "Niaje! Welcome to Nairobi Kicks Studio. We have 4 pairs of Air Force 1 White remaining in stock!";
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return res.status(400).json({ error: "Missing ELEVENLABS_API_KEY" });
  }

  try {
    const ttsRes = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${targetVoice}?output_format=mp3_44100_128`,
      {
        text: sampleText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true }
      },
      {
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        responseType: 'arraybuffer'
      }
    );

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': ttsRes.data.length
    });
    res.send(Buffer.from(ttsRes.data));
  } catch (err) {
    console.error("Preview voice error:", err.response?.data ? JSON.stringify(err.response.data) : err.message);
    res.status(500).json({ error: "Failed to generate sample" });
  }
});

app.post('/api/tenant/conversations/send-message', tenantMiddleware, async (req, res) => {
  const { customerId, text } = req.body;
  if (!customerId || !text) {
    return res.status(400).json({ error: "customerId and text are required" });
  }

  const cleanPhone = customerId.toString().replace(/\+/g, '').trim();
  const sessionKey = `${req.tenant.id}_${cleanPhone}`;
  const profile = db.crmProfiles[sessionKey];

  if (profile) {
    profile.conversationHistory.push({
      role: 'model',
      text: text,
      timestamp: new Date().toISOString()
    });
    profile.lastInteraction = new Date().toISOString();
    saveStore();
  }

  await sendWhatsAppText(req.tenant, cleanPhone, text);
  res.json({ success: true, message: "Outbound message sent directly to customer" });
});

app.post('/api/tenant/payments/daraja', tenantMiddleware, (req, res) => {
  const { type, shortcode } = req.body;
  const cleanShortcode = String(shortcode || "174379").trim();
  
  if (!req.tenant.daraja) req.tenant.daraja = {};
  
  req.tenant.daraja.type = (cleanShortcode === "174379" || !type) ? "CustomerPayBillOnline" : type;
  req.tenant.daraja.shortcode = cleanShortcode;
  req.tenant.daraja.passkey = DEFAULT_SANDBOX_PASSKEY;
  req.tenant.daraja.consumerKey = String(process.env.DARAJA_CONSUMER_KEY || "").trim();
  req.tenant.daraja.consumerSecret = String(process.env.DARAJA_CONSUMER_SECRET || "").trim();

  saveStore();
  res.json({ success: true, daraja: req.tenant.daraja });
});

app.post('/api/tenant/payments/test-stk', tenantMiddleware, async (req, res) => {
  const { testPhone } = req.body;
  if (!testPhone) return res.status(400).json({ error: "testPhone is required" });

  const result = await triggerTenantSTKPush(req.tenant, testPhone, 1, "TestSTK");
  if (result && result.ResponseCode === "0") {
    res.json({ success: true, message: "STK prompt sent to your phone!", result });
  } else {
    const errMsg = result?.details?.errorMessage || result?.details?.ResponseDescription || "STK prompt failed";
    res.status(500).json({ success: false, message: errMsg, result: result?.details || result });
  }
});

app.get('/api/tenant/conversations', tenantMiddleware, (req, res) => {
  const tenantChats = Object.values(db.crmProfiles).filter(p => p.tenantId === req.tenant.id);
  res.json(tenantChats);
});

app.post('/api/tenant/conversations/toggle-pause', tenantMiddleware, (req, res) => {
  const { customerId, isPaused } = req.body;
  const sessionKey = `${req.tenant.id}_${customerId}`;
  if (db.crmProfiles[sessionKey]) {
    db.crmProfiles[sessionKey].isPaused = Boolean(isPaused);
    saveStore();
    return res.json({ success: true, isPaused: db.crmProfiles[sessionKey].isPaused });
  }
  res.status(404).json({ error: "Conversation thread not found" });
});

// ==========================================
// 9. AUTOMATED CRON SCHEDULER
// ==========================================
cron.schedule('0 * * * *', async () => {
  const now = new Date();
  for (const profile of Object.values(db.crmProfiles)) {
    if (profile.cart && profile.stage === 'CLOSING' && !profile.isPaused) {
      const elapsedHours = (now - new Date(profile.cart.timestamp)) / (1000 * 60 * 60);

      if (elapsedHours >= 2 && elapsedHours <= 4 && !profile.followedUp) {
        profile.followedUp = true;
        saveStore();
        const tenant = db.tenants[profile.tenantId] || db.tenants["luvon_q_flagship"];
        const msg = `Hey! Just checking in from ${tenant.businessName}. You were looking at *${profile.cart.item}* (KSh ${profile.cart.amount}) earlier.\n\nWould you like me to send a fresh M-Pesa prompt, or do you have any questions?`;
        await sendWhatsAppText(tenant, profile.customerId, msg);
      }
    }
  }
});

cron.schedule('0 20 * * 0', async () => {
  for (const tenant of Object.values(db.tenants)) {
    if (!tenant.escalationPhone) continue;
    const tenantSales = db.attributionLedger.filter(t => t.tenantId === tenant.id);
    const totalRevenue = tenantSales.reduce((sum, entry) => sum + entry.amount, 0);
    const report = 
`📈 *${tenant.brandSignature || tenant.businessName} REVENUE REPORT*
━━━━━━━━━━━━━━━━━━━━━
💰 *DIRECT REVENUE GENERATED:*
• Total Sales: KSh ${totalRevenue.toLocaleString()}
• Closed Deals: ${tenantSales.length}
• Attribution Source: 100% Conversational AI Agent
━━━━━━━━━━━━━━━━━━━━━`;
    await sendWhatsAppText(tenant, tenant.escalationPhone, report);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Luvon Q Orélune Multi-Tenant Engine running on port ${PORT}`));