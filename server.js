require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const cron = require('node-cron');

// 1. SUPABASE REST & AUTH INTEGRATION VIA AXIOS
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kmwwgmzypjnjfkpoyims.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_DhTvZ4K5YCYLXErehDkBFQ_noylBgEH';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseHeaders = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

const geminiApiKey = (process.env.GEMINI_API_KEY || "").trim();
console.log("🔑 WhatsApp Token Prefix:", process.env.WHATSAPP_ACCESS_TOKEN ? process.env.WHATSAPP_ACCESS_TOKEN.substring(0, 14) + "..." : "❌ NO TOKEN LOADED");
console.log("✨ Gemini Key Prefix:", geminiApiKey ? geminiApiKey.substring(0, 10) + "..." : "❌ NO GEMINI KEY LOADED");
console.log("🗄️ Supabase REST Host:", SUPABASE_URL);
console.log("🛡️ Supabase Service Role Key:", SUPABASE_SERVICE_ROLE_KEY ? "CONFIGURED" : "❌ MISSING (Required for Team Invites)");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-tenant-id');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DEFAULT_FEMALE_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

const HC_SHORTCODE = process.env.DARAJA_BUSINESS_SHORTCODE || "174379";
const HC_PASSKEY = process.env.DARAJA_PASSKEY || "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
const HC_CONSUMER_KEY = process.env.DARAJA_CONSUMER_KEY || "5U68vQHgUCU7HpYSQZXegh2pFmzG1uBPTMNFcw5obW96GPVn";
const HC_CONSUMER_SECRET = process.env.DARAJA_CONSUMER_SECRET || "2qwVKez82Raza13QyV9Ti8GqNLWKgGPWrJVpr1eot3OGNWluJAO1QaAjr1WaDsII";

// ==========================================
// 1. MULTI-TENANT PERSISTENT STORE
// ==========================================
const DB_FILE = process.env.VERCEL ? path.join('/tmp', 'multi_tenant_store.json') : path.join(__dirname, 'multi_tenant_store.json');

function initializeStore() {
  let loadedStore = null;
  const seedFile = path.join(__dirname, 'multi_tenant_store.json');

  if (fs.existsSync(DB_FILE)) {
    try { loadedStore = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) {}
  } else if (fs.existsSync(seedFile)) {
    try { loadedStore = JSON.parse(fs.readFileSync(seedFile, 'utf8')); } catch (e) {}
  }

  if (!loadedStore) {
    loadedStore = {
      tenants: {
        "luvon_q_flagship": {
          id: "luvon_q_flagship",
          businessName: "Luvon Q Flagship",
          brandSignature: "Defining the Gold Standard",
          industry: "Luxury Conversational Commerce",
          tone: "luxury_chic",
          languagePreference: "mirror_user",
          elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID || DEFAULT_FEMALE_VOICE_ID,
          escalationPhone: process.env.AGENT_PHONE_NUMBER || "254768820142",
          whatsappPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID || "1279716021891578",
          currency: "KSh",
          orderPrefix: "LQ",
          enableAlerts: true,
          teamMembers: [],
          catalog: []
        }
      },
      crmProfiles: {},
      orders: {},
      attributionLedger: [],
      processedMessageIds: []
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
    console.error("❌ Failed to save store:", e.message);
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

function tenantMiddleware(req, res, next) {
  const tenantId = req.headers['x-tenant-id'] || 'luvon_q_flagship';
  if (!db.tenants[tenantId]) {
    db.tenants[tenantId] = {
      id: tenantId,
      businessName: "Merchant Store",
      industry: "Retail & Services",
      tone: "luxury_chic",
      currency: "KSh",
      orderPrefix: "ORD",
      enableAlerts: true,
      teamMembers: [],
      catalog: []
    };
    saveStore();
  }
  req.tenant = db.tenants[tenantId];
  next();
}

// ==========================================
// 2. AI ONBOARDING ENGINE (GEMINI 3.8 FLASH)
// ==========================================
async function callGeminiAPI(systemPrompt, userText) {
  const models = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-pro'];

  for (const model of models) {
    try {
      console.log(`✨ Invoking Google Gemini model [${model}]...`);
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
        {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig: { maxOutputTokens: 800 }
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
      );

      const candidateText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (candidateText && candidateText.trim()) {
        return candidateText.trim();
      }
    } catch (err) {
      console.warn(`⚠️ Model [${model}] failed:`, err.response?.data?.error?.message || err.message);
    }
  }
  throw new Error("All Gemini models failed to respond.");
}

async function handleAIOnboarding(req, res) {
  const { prompt } = req.body;
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: "Please provide a description of your business." });
  }

  if (!geminiApiKey) {
    return res.status(500).json({ error: "Gemini API Key is not configured on the server." });
  }

  try {
    const systemPrompt = `
You are the elite commerce architect for Luvon Q.
A merchant described their business:
"${prompt}"

Analyze this description and extract structured JSON matching this EXACT schema:
{
  "businessName": "Clear Business Name",
  "industry": "Industry Category",
  "tone": "luxury_chic" | "street_sheng" | "warm_friendly" | "corporate_concise",
  "catalog": [
    {
      "name": "Product or service name",
      "price": 5000,
      "stock": 10,
      "category": "Category",
      "tags": ["tag1", "tag2"]
    }
  ]
}
Return STRICT RAW JSON only. Do not wrap in markdown or backticks.
`;

    const rawOutput = await callGeminiAPI(systemPrompt, prompt);
    const cleanedJson = rawOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanedJson);

    req.tenant.businessName = parsed.businessName || req.tenant.businessName;
    req.tenant.industry = parsed.industry || req.tenant.industry;
    req.tenant.tone = parsed.tone || req.tenant.tone;
    req.tenant.catalog = parsed.catalog || [];

    await axios.post(`${SUPABASE_URL}/rest/v1/tenants`, {
      id: req.tenant.id,
      business_name: req.tenant.businessName,
      industry: req.tenant.industry,
      tone: req.tenant.tone
    }, {
      headers: { ...supabaseHeaders, 'Prefer': 'resolution=merge-duplicates' }
    }).catch(() => {});

    if (parsed.catalog && parsed.catalog.length > 0) {
      const inventoryRows = parsed.catalog.map(item => ({
        tenant_id: req.tenant.id,
        name: item.name,
        price: Number(item.price || 0),
        stock: Number(item.stock || 5),
        category: item.category || 'General',
        tags: item.tags || []
      }));

      await axios.delete(`${SUPABASE_URL}/rest/v1/inventory?tenant_id=eq.${req.tenant.id}`, {
        headers: supabaseHeaders
      }).catch(() => {});

      await axios.post(`${SUPABASE_URL}/rest/v1/inventory`, inventoryRows, {
        headers: supabaseHeaders
      }).catch(() => {});
    }

    saveStore();

    return res.json({
      success: true,
      businessName: req.tenant.businessName,
      industry: req.tenant.industry,
      tone: req.tenant.tone,
      catalog: req.tenant.catalog
    });
  } catch (err) {
    console.error("❌ AI Onboard Failure:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

app.post('/api/tenant/ai-onboard', tenantMiddleware, handleAIOnboarding);
app.post('/api/ai-onboard', tenantMiddleware, handleAIOnboarding);

// ==========================================
// 3. SETTINGS & WORKSPACE API ENDPOINTS
// ==========================================
// Account & Profile: Update
app.post('/api/tenant/settings/profile', tenantMiddleware, async (req, res) => {
  const { businessName, brandSignature, industry, escalationPhone, currency, orderPrefix, enableAlerts } = req.body;

  if (businessName) req.tenant.businessName = businessName;
  if (brandSignature !== undefined) req.tenant.brandSignature = brandSignature;
  if (industry) req.tenant.industry = industry;
  if (escalationPhone !== undefined) req.tenant.escalationPhone = escalationPhone;
  if (currency) req.tenant.currency = currency;
  if (orderPrefix) req.tenant.orderPrefix = orderPrefix;
  if (enableAlerts !== undefined) req.tenant.enableAlerts = Boolean(enableAlerts);

  saveStore();

  await axios.post(`${SUPABASE_URL}/rest/v1/tenants`, {
    id: req.tenant.id,
    business_name: req.tenant.businessName,
    brand_signature: req.tenant.brandSignature,
    industry: req.tenant.industry
  }, {
    headers: { ...supabaseHeaders, 'Prefer': 'resolution=merge-duplicates' }
  }).catch(() => {});

  res.json({ success: true, tenant: req.tenant });
});

// Team Members: List
app.get('/api/tenant/team', tenantMiddleware, (req, res) => {
  res.json({
    success: true,
    members: req.tenant.teamMembers || []
  });
});

// Team Members: Invite (Direct Supabase Auth Dispatch + Strict Error Catching)
app.post('/api/tenant/team/invite', tenantMiddleware, async (req, res) => {
  const { email, role } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: "A valid email address is required." });
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!req.tenant.teamMembers) req.tenant.teamMembers = [];
  
  const existing = req.tenant.teamMembers.find(m => m.email.toLowerCase() === cleanEmail);
  if (existing) {
    return res.status(400).json({ error: "This email already has an active invitation or workspace role." });
  }

  // Ensure Service Role Key is available to authorize /auth/v1/invite
  const keyToUse = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("⚠️ SUPABASE_SERVICE_ROLE_KEY is missing. Attempting with ANON key (may be blocked by Supabase Auth).");
  }

  try {
    // 1. Dispatch official Supabase Auth invitation email
    const authInviteRes = await axios.post(
      `${SUPABASE_URL}/auth/v1/invite`,
      { 
        email: cleanEmail,
        data: {
          role: role || 'Sales Agent',
          tenant_id: req.tenant.id,
          tenant_name: req.tenant.businessName
        }
      },
      {
        headers: {
          'apikey': keyToUse,
          'Authorization': `Bearer ${keyToUse}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // 2. Add as Pending to the workspace record
    const newMember = {
      id: authInviteRes.data?.id ? 'mem_' + authInviteRes.data.id.slice(0, 8) : 'mem_' + Date.now(),
      email: cleanEmail,
      role: role || 'Sales Agent',
      status: 'Pending',
      invitedAt: new Date().toISOString()
    };

    req.tenant.teamMembers.push(newMember);
    saveStore();

    return res.json({ success: true, member: newMember, message: `Invitation dispatched to ${cleanEmail}` });
  } catch (authErr) {
    const errorDetails = authErr.response?.data?.msg || authErr.response?.data?.error_description || authErr.message;
    console.error("❌ Supabase Auth Invite Rejected:", errorDetails);
    
    // Distinguish service role configuration issues
    if (authErr.response?.status === 401 || authErr.response?.status === 403) {
      return res.status(500).json({ 
        error: "Supabase denied invitation dispatch. SUPABASE_SERVICE_ROLE_KEY must be added to your environment variables on Render." 
      });
    }

    return res.status(400).json({ error: `Invite failed: ${errorDetails}` });
  }
});

// Team Members: Resend Invitation
app.post('/api/tenant/team/resend', tenantMiddleware, async (req, res) => {
  const { memberId } = req.body;
  const member = (req.tenant.teamMembers || []).find(m => m.id === memberId);

  if (!member) {
    return res.status(404).json({ error: "Team member not found." });
  }

  const keyToUse = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  try {
    await axios.post(
      `${SUPABASE_URL}/auth/v1/invite`,
      { 
        email: member.email,
        data: { role: member.role, tenant_id: req.tenant.id }
      },
      {
        headers: {
          'apikey': keyToUse,
          'Authorization': `Bearer ${keyToUse}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return res.json({ success: true, message: `Invitation resent to ${member.email}` });
  } catch (err) {
    const errorDetails = err.response?.data?.msg || err.message;
    return res.status(400).json({ error: `Could not resend: ${errorDetails}` });
  }
});

// Team Members: Remove
app.delete('/api/tenant/team/:memberId', tenantMiddleware, (req, res) => {
  const { memberId } = req.params;
  req.tenant.teamMembers = (req.tenant.teamMembers || []).filter(m => m.id !== memberId);
  saveStore();
  res.json({ success: true });
});

// Danger Zone: Cascade Account Deletion
app.delete('/api/tenant/account', tenantMiddleware, async (req, res) => {
  const tenantId = req.tenant.id;
  const { confirmation } = req.body;

  if (confirmation !== "DELETE") {
    return res.status(400).json({ error: "Type DELETE exactly to confirm account termination." });
  }

  try {
    await axios.delete(`${SUPABASE_URL}/rest/v1/inventory?tenant_id=eq.${tenantId}`, { headers: supabaseHeaders }).catch(() => {});
    await axios.delete(`${SUPABASE_URL}/rest/v1/conversations?tenant_id=eq.${tenantId}`, { headers: supabaseHeaders }).catch(() => {});
    await axios.delete(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${tenantId}`, { headers: supabaseHeaders }).catch(() => {});

    delete db.tenants[tenantId];
    db.attributionLedger = db.attributionLedger.filter(l => l.tenantId !== tenantId);
    Object.keys(db.crmProfiles).forEach(k => {
      if (k.startsWith(`${tenantId}_`)) delete db.crmProfiles[k];
    });

    saveStore();
    res.json({ success: true, message: "Workspace and associated records deleted permanently." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. SUPABASE SERVER AUTH PROXY
// ==========================================
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, fullName } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  try {
    const authRes = await axios.post(`${SUPABASE_URL}/auth/v1/signup`, {
      email,
      password,
      data: { full_name: fullName }
    }, { headers: supabaseHeaders });

    const user = authRes.data.user || authRes.data;
    const session = authRes.data.session || null;

    const requiresVerification = !session && (!user.confirmed_at && !user.email_confirmed_at);
    const tenantId = 'tenant_' + (user.id ? user.id.slice(0, 8) : Date.now());

    await axios.post(`${SUPABASE_URL}/rest/v1/tenants`, {
      id: tenantId,
      owner_id: user.id,
      business_name: fullName || 'New Business',
      brand_signature: (fullName || 'New Business') + ' Official',
      industry: 'Retail & Services'
    }, { headers: supabaseHeaders }).catch(() => {});

    db.tenants[tenantId] = {
      id: tenantId,
      businessName: fullName || 'New Business',
      brandSignature: (fullName || 'New Business') + ' Official',
      industry: 'Retail & Services',
      tone: 'luxury_chic',
      currency: 'KSh',
      orderPrefix: 'LQ',
      enableAlerts: true,
      teamMembers: [],
      catalog: []
    };
    saveStore();

    res.json({
      success: true,
      requiresVerification,
      user,
      tenantId,
      businessName: fullName
    });
  } catch (err) {
    const msg = err.response?.data?.msg || err.response?.data?.error_description || err.message;
    res.status(400).json({ error: msg });
  }
});

app.post('/api/auth/signin', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  try {
    const authRes = await axios.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      email,
      password
    }, { headers: supabaseHeaders });

    const user = authRes.data.user;
    let businessName = user.user_metadata?.full_name || 'My Store';
    let tenantId = 'tenant_' + user.id.slice(0, 8);

    const tenantRes = await axios.get(`${SUPABASE_URL}/rest/v1/tenants?owner_id=eq.${user.id}&limit=1`, {
      headers: supabaseHeaders
    }).catch(() => null);

    if (tenantRes?.data?.[0]) {
      tenantId = tenantRes.data[0].id;
      businessName = tenantRes.data[0].business_name;
    }

    if (!db.tenants[tenantId]) {
      db.tenants[tenantId] = {
        id: tenantId,
        businessName,
        teamMembers: [],
        catalog: []
      };
      saveStore();
    }

    res.json({ success: true, user, tenantId, businessName });
  } catch (err) {
    const msg = err.response?.data?.error_description || err.response?.data?.msg || err.message;
    res.status(400).json({ error: msg });
  }
});

// ==========================================
// 5. REST DATA & SETTINGS ENDPOINTS
// ==========================================
app.get('/api/tenant/settings', tenantMiddleware, (req, res) => {
  res.json({
    success: true,
    tenant: req.tenant,
    availableVoices: [
      { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah (Soft & Professional Female)" },
      { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice (Expressive & Natural Female)" },
      { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura (Warm & Upbeat Female)" },
      { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica (Modern Concise Female)" },
      { id: "JBFqnCBsd6RMkjVDRZzb", name: "George (British Male)" }
    ]
  });
});

app.get('/api/tenant/metrics', tenantMiddleware, async (req, res) => {
  const tenantSales = db.attributionLedger.filter(t => t.tenantId === req.tenant.id);
  const totalRevenue = tenantSales.reduce((sum, t) => sum + t.amount, 0);
  const activeChats = Object.values(db.crmProfiles).filter(p => p.tenantId === req.tenant.id);

  res.json({
    totalRevenue,
    dealsClosed: tenantSales.length,
    activeCustomers: activeChats.length,
    catalogItems: req.tenant.catalog ? req.tenant.catalog.length : 0
  });
});

app.get('/api/tenant/inventory', tenantMiddleware, async (req, res) => {
  try {
    const invRes = await axios.get(`${SUPABASE_URL}/rest/v1/inventory?tenant_id=eq.${req.tenant.id}`, {
      headers: supabaseHeaders
    });
    if (invRes.data && invRes.data.length > 0) return res.json(invRes.data);
  } catch (e) {}
  res.json(req.tenant.catalog || []);
});

app.post('/api/tenant/inventory', tenantMiddleware, async (req, res) => {
  const { name, price, stock, category, tags, imageUrl } = req.body;
  const newItem = {
    id: String(Date.now()),
    name,
    price: Number(price),
    stock: Number(stock || 0),
    category: category || "General",
    tags: tags || [],
    hasImage: Boolean(imageUrl),
    imageUrl: imageUrl || null
  };

  req.tenant.catalog.push(newItem);
  saveStore();

  await axios.post(`${SUPABASE_URL}/rest/v1/inventory`, {
    tenant_id: req.tenant.id,
    name,
    price: Number(price),
    stock: Number(stock || 0),
    category,
    tags,
    image_url: imageUrl
  }, { headers: supabaseHeaders }).catch(() => {});

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
  res.json({ success: true, tenant: req.tenant });
});

app.post('/api/tenant/voice/preview', async (req, res) => {
  const { voiceId, text } = req.body;
  const targetVoice = voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_FEMALE_VOICE_ID;
  const sampleText = text || "Niaje! Welcome to Luvon Q. We are ready to handle your bookings!";
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) return res.status(400).json({ error: "Missing ELEVENLABS_API_KEY" });

  try {
    const ttsRes = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${targetVoice}?output_format=mp3_44100_128`,
      {
        text: sampleText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true }
      },
      { headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' }, responseType: 'arraybuffer' }
    );

    res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': ttsRes.data.length });
    res.send(Buffer.from(ttsRes.data));
  } catch (err) {
    res.status(500).json({ error: "Failed to generate sample" });
  }
});

app.post('/api/tenant/conversations/simulate-inquiry', tenantMiddleware, async (req, res) => {
  const { customerId, text } = req.body;
  if (!text) return res.status(400).json({ error: "Text inquiry is required" });

  const phone = customerId ? customerId.toString().replace(/\+/g, '').trim() : "254708374149";
  const { profile } = getOrCreateCustomerSession(req.tenant, phone, 'whatsapp');

  try {
    const systemPrompt = `
You are the dedicated AI sales concierge for **${req.tenant.businessName}**, an elite ${req.tenant.industry || 'boutique'} in Nairobi.
Stage: ${(profile.stage || 'QUALIFICATION').toUpperCase()}
Catalog: ${JSON.stringify(req.tenant.catalog, null, 2)}
Tone: ${(req.tenant.tone || 'luxury_chic').toUpperCase()}
Directives: Concise 1-3 sentences in warm Kenyan concierge voice. Quote prices clearly in KSh.
`;
    const botReply = await callGeminiAPI(systemPrompt, text);

    profile.conversationHistory.push(
      { role: 'user', text, timestamp: new Date().toISOString() },
      { role: 'model', text: botReply, timestamp: new Date().toISOString() }
    );
    saveStore();

    res.json({ success: true, userText: text, botReply, conversationHistory: profile.conversationHistory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tenant/conversations/send-message', tenantMiddleware, async (req, res) => {
  const { customerId, text } = req.body;
  if (!customerId || !text) return res.status(400).json({ error: "customerId and text required" });

  const cleanPhone = customerId.toString().replace(/\+/g, '').trim();
  const sessionKey = `${req.tenant.id}_${cleanPhone}`;
  const profile = db.crmProfiles[sessionKey];

  if (profile) {
    profile.conversationHistory.push({ role: 'model', text, timestamp: new Date().toISOString() });
    profile.lastInteraction = new Date().toISOString();
    saveStore();
  }

  try {
    const sendResult = await sendWhatsAppText(req.tenant, cleanPhone, text);
    res.json({ success: true, message: "Outbound message delivered", details: sendResult });
  } catch (err) {
    res.status(500).json({ error: "Meta API delivery failed", details: err.response?.data || err.message });
  }
});

app.post('/api/tenant/payments/daraja', tenantMiddleware, (req, res) => {
  res.json({ success: true, daraja: req.tenant.daraja });
});

app.post('/api/tenant/payments/test-stk', tenantMiddleware, async (req, res) => {
  const { testPhone } = req.body;
  let cleanPhone = String(testPhone || "254708374149").replace(/\D/g, '').trim();
  if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
  if (!cleanPhone.startsWith('254')) cleanPhone = '254' + cleanPhone;

  const result = await triggerTenantSTKPush(req.tenant, cleanPhone, 1, "Test");
  if (result.success && (result.result?.ResponseCode === "0" || result.result?.CheckoutRequestID)) {
    return res.status(200).json({ success: true, message: result.result?.CustomerMessage || "STK push dispatched!", result: result.result });
  }
  return res.status(400).json({ success: false, message: "Safaricom Gateway rejected prompt", details: result.details || result });
});

app.get('/api/tenant/conversations', tenantMiddleware, (req, res) => {
  const tenantChats = Object.values(db.crmProfiles).filter(p => p.tenantId === req.tenant.id);
  res.json(tenantChats);
});

app.post('/api/tenant/conversations/toggle-pause', tenantMiddleware, (req, res) => {
  const { customerId, isPaused } = req.body;
  const cleanPhone = customerId.toString().replace(/\+/g, '').trim();
  const sessionKey = `${req.tenant.id}_${cleanPhone}`;
  if (db.crmProfiles[sessionKey]) {
    db.crmProfiles[sessionKey].isPaused = Boolean(isPaused);
    saveStore();
    return res.json({ success: true, isPaused: db.crmProfiles[sessionKey].isPaused });
  }
  res.status(404).json({ error: "Conversation thread not found" });
});

// ==========================================
// 6. DARAJA SANDBOX GATEWAY
// ==========================================
let cachedDarajaToken = null;
let tokenExpiryTime = 0;

async function getHardcodedDarajaToken(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedDarajaToken && now < tokenExpiryTime) return cachedDarajaToken;

  const auth = Buffer.from(`${HC_CONSUMER_KEY}:${HC_CONSUMER_SECRET}`).toString('base64');
  const response = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
    headers: { Authorization: `Basic ${auth}` },
    timeout: 20000
  });

  cachedDarajaToken = response.data.access_token;
  tokenExpiryTime = now + (Number(response.data.expires_in || 3599) - 60) * 1000;
  return cachedDarajaToken;
}

async function executeDarajaSTK(tenant, phoneNumber, amount, itemRef, isRetry = false) {
  try {
    const rawToken = await getHardcodedDarajaToken(isRetry);
    const token = String(rawToken).trim();

    const eatDate = new Date(Date.now() + (3 * 60 * 60 * 1000));
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${eatDate.getUTCFullYear()}${pad(eatDate.getUTCMonth() + 1)}${pad(eatDate.getUTCDate())}${pad(eatDate.getUTCHours())}${pad(eatDate.getUTCMinutes())}${pad(eatDate.getUTCSeconds())}`;
    const password = Buffer.from(`${HC_SHORTCODE}${HC_PASSKEY}${timestamp}`).toString('base64');

    let cleanPhone = String(phoneNumber || '').replace(/\D/g, '').trim();
    if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
    if (!cleanPhone.startsWith('254')) cleanPhone = '254' + cleanPhone;
    if (cleanPhone.length !== 12) cleanPhone = "254708374149";

    const serverBaseUrl = (process.env.SERVER_URL || "https://luvon-engine.onrender.com").replace(/\/$/, "");
    const res = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        BusinessShortCode: HC_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.max(1, Math.round(Number(amount) || 1)),
        PartyA: cleanPhone,
        PartyB: HC_SHORTCODE,
        PhoneNumber: cleanPhone,
        CallBackURL: `${serverBaseUrl}/api/stk-callback`,
        AccountReference: "LuvonQ",
        TransactionDesc: "Payment"
      },
      { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 25000 }
    );
    return { success: true, result: res.data };
  } catch (err) {
    const errorDetails = err.response?.data || { errorMessage: err.message };
    if (!isRetry && (err.response?.status === 401 || JSON.stringify(errorDetails).includes('Invalid Access Token'))) {
      cachedDarajaToken = null;
      await sleep(1000);
      return await executeDarajaSTK(tenant, phoneNumber, amount, itemRef, true);
    }
    return { error: true, details: errorDetails };
  }
}

async function triggerTenantSTKPush(tenant, phoneNumber, amount, itemRef) {
  return await executeDarajaSTK(tenant, phoneNumber, amount, itemRef, false);
}

function getOrCreateCustomerSession(tenant, customerId, channel = 'whatsapp') {
  const cleanId = customerId.toString().replace(/\+/g, '').trim();
  const sessionKey = `${tenant.id}_${cleanId}`;
  let profile = db.crmProfiles[sessionKey];
  if (!profile) {
    profile = { tenantId: tenant.id, customerId: cleanId, channel, stage: 'QUALIFICATION', cart: null, isPaused: false, conversationHistory: [] };
    db.crmProfiles[sessionKey] = profile;
    saveStore();
  }
  return { profile, sessionKey };
}

async function sendWhatsAppText(tenant, toPhone, text) {
  let cleanPhone = toPhone.toString().replace(/\D/g, '').trim();
  if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
  if (!cleanPhone.startsWith('254')) cleanPhone = '254' + cleanPhone;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || tenant.whatsappPhoneId || "1279716021891578";

  const res = await axios.post(
    `https://graph.facebook.com/v20.0/${phoneId}/messages`,
    { messaging_product: 'whatsapp', to: cleanPhone, type: 'text', text: { body: String(text).trim() } },
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
  );
  return res.data;
}

app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] && req.query['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

app.post('/webhook', (req, res) => res.sendStatus(200));
app.post('/api/stk-callback', (req, res) => res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" }));

app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.send("Luvon Q API is running.");
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => console.log(`🚀 Luvon Q Multi-Tenant Engine running on port ${PORT}`));
}

module.exports = app;