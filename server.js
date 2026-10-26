require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const cron = require('node-cron');

// 1. SUPABASE REST & AUTH INTEGRATION (STRICT ENV ONLY)
const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const supabaseHeaders = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

const geminiApiKey = (process.env.GEMINI_API_KEY || "").trim();

const app = express();

// ==========================================
// BODY PARSER & STATIC ASSETS
// ==========================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
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

// DARAJA CREDENTIALS (STRICT ENV ONLY)
const HC_SHORTCODE = (process.env.DARAJA_BUSINESS_SHORTCODE || "174379").trim();
const HC_PASSKEY = (process.env.DARAJA_PASSKEY || "").trim();
const HC_CONSUMER_KEY = (process.env.DARAJA_CONSUMER_KEY || "").trim();
const HC_CONSUMER_SECRET = (process.env.DARAJA_CONSUMER_SECRET || "").trim();

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
          escalationPhone: process.env.AGENT_PHONE_NUMBER || "254700000000",
          whatsappPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
          currency: "KSh",
          orderPrefix: "LQ",
          enableAlerts: true,
          teamMembers: [],
          catalog: [],
          metaPageId: process.env.META_PAGE_ID || null,
          metaPageAccessToken: process.env.META_PAGE_ACCESS_TOKEN || null,
          metaIgBusinessId: process.env.META_IG_BUSINESS_ID || null
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
    console.error("Failed to save store:", e.message);
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

// STRICT SERVER-SIDE ROUTE GUARD
function tenantMiddleware(req, res, next) {
  let tenantId = req.headers['x-tenant-id'];
  if (!tenantId || tenantId === 'anonymous') {
    return res.status(401).json({ error: "Unauthorized. Please sign in to access store operations." });
  }

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
      catalog: [],
      metaPageId: null,
      metaPageAccessToken: null,
      metaIgBusinessId: null
    };
    saveStore();
  }
  req.tenant = db.tenants[tenantId];
  next();
}

// ==========================================
// 2. BACKEND OAUTH PROXY & AUTH VERIFICATION
// ==========================================
app.get('/api/auth/oauth/:provider', (req, res) => {
  const { provider } = req.params;
  const redirectUrl = req.query.redirect_to || `${req.protocol}://${req.get('host')}/index.html`;

  if (!SUPABASE_URL) {
    return res.status(500).send("SUPABASE_URL is not configured in .env on the server.");
  }

  const oauthUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectUrl)}&prompt=select_account`;
  res.redirect(oauthUrl);
});

app.post('/api/auth/verify-token', async (req, res) => {
  const { accessToken } = req.body;
  if (!accessToken) return res.status(400).json({ error: "Access token is required." });

  try {
    const userRes = await axios.get(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const user = userRes.data;
    const meta = user.user_metadata || {};
    const businessName = meta.tenant_name || meta.full_name || meta.name || meta.user_name || (user.email ? user.email.split('@')[0] : 'My Store');
    const tenantId = meta.tenant_id || `tenant_${user.id.replace(/-/g, '').slice(0, 10)}`;
    const avatarUrl = meta.avatar_url || meta.picture || null;

    if (!db.tenants[tenantId]) {
      db.tenants[tenantId] = {
        id: tenantId,
        businessName,
        industry: "Retail & Services",
        tone: "luxury_chic",
        currency: "KSh",
        orderPrefix: "ORD",
        enableAlerts: true,
        teamMembers: [],
        catalog: [],
        metaPageId: null,
        metaPageAccessToken: null,
        metaIgBusinessId: null
      };
      saveStore();
    }

    res.json({
      success: true,
      user,
      tenantId,
      businessName,
      avatarUrl
    });
  } catch (err) {
    const msg = err.response?.data?.error_description || err.response?.data?.msg || err.message;
    res.status(401).json({ error: msg });
  }
});

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
    const tenantId = 'tenant_' + (user.id ? user.id.replace(/-/g, '').slice(0, 10) : Date.now());

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
      catalog: [],
      metaPageId: null,
      metaPageAccessToken: null,
      metaIgBusinessId: null
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
    let tenantId = 'tenant_' + user.id.replace(/-/g, '').slice(0, 10);

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
        catalog: [],
        metaPageId: null,
        metaPageAccessToken: null,
        metaIgBusinessId: null
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
// 3. AI CONVERSATIONAL ENGINE (GEMINI CASCADE)
// ==========================================
async function callGeminiAPI(systemPrompt, userText) {
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
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
        const errorMsg = err.response?.data?.error?.message || err.message;
        if (errorMsg.includes('high demand') || err.response?.status === 429 || err.response?.status === 503) {
          await sleep(1500);
        } else {
          break;
        }
      }
    }
  }

  return "Niaje! Tuko hapa kukusaidia. System yetu inafanya update kidogo—unatafuta nini specifically nikusaidie right now?";
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
    return res.status(500).json({ error: "Our AI store architect is experiencing high demand. Please try again." });
  }
}

app.post('/api/tenant/ai-onboard', tenantMiddleware, handleAIOnboarding);
app.post('/api/ai-onboard', tenantMiddleware, handleAIOnboarding);

// ==========================================
// 4. SETTINGS & WORKSPACE ENDPOINTS
// ==========================================
app.post('/api/tenant/sync-profile', tenantMiddleware, async (req, res) => {
  const { userId, email, businessName, avatarUrl } = req.body;

  if (businessName && (!req.tenant.businessName || req.tenant.businessName === 'Merchant Store')) {
    req.tenant.businessName = businessName;
  }
  if (userId) req.tenant.ownerId = userId;
  if (email) req.tenant.ownerEmail = email;
  if (avatarUrl) req.tenant.avatarUrl = avatarUrl;

  if (email && req.tenant.teamMembers) {
    const cleanEmail = email.trim().toLowerCase();
    req.tenant.teamMembers = req.tenant.teamMembers.map(m =>
      m.email.toLowerCase() === cleanEmail
        ? { ...m, status: 'Active', acceptedAt: new Date().toISOString() }
        : m
    );
  }

  saveStore();

  await axios.post(`${SUPABASE_URL}/rest/v1/tenants`, {
    id: req.tenant.id,
    owner_id: userId || null,
    business_name: req.tenant.businessName,
    brand_signature: req.tenant.brandSignature || `${req.tenant.businessName} Official`,
    industry: req.tenant.industry || 'Retail & Services'
  }, {
    headers: { ...supabaseHeaders, 'Prefer': 'resolution=merge-duplicates' }
  }).catch(() => {});

  res.json({ success: true, tenant: req.tenant });
});

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

app.get('/api/tenant/team', tenantMiddleware, (req, res) => {
  res.json({ success: true, members: req.tenant.teamMembers || [] });
});

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

  const keyToUse = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

  try {
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
    return res.status(400).json({ error: `Invite failed: ${errorDetails}` });
  }
});

app.post('/api/tenant/team/accept', tenantMiddleware, (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const cleanEmail = email.trim().toLowerCase();
  let found = false;

  if (req.tenant.teamMembers) {
    req.tenant.teamMembers = req.tenant.teamMembers.map(m => {
      if (m.email.toLowerCase() === cleanEmail) {
        found = true;
        return { ...m, status: 'Active', acceptedAt: new Date().toISOString() };
      }
      return m;
    });
  }

  if (found) saveStore();
  res.json({ success: true, status: 'Active' });
});

app.delete('/api/tenant/team/:memberId', tenantMiddleware, (req, res) => {
  const { memberId } = req.params;
  req.tenant.teamMembers = (req.tenant.teamMembers || []).filter(m => m.id !== memberId);
  saveStore();
  res.json({ success: true });
});

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

  const phone = customerId ? customerId.toString().replace(/\+/g, '').trim() : "254700000000";
  const { profile } = getOrCreateCustomerSession(req.tenant, phone, 'whatsapp');

  try {
    const systemPrompt = `
You are the dedicated AI sales concierge for **${req.tenant.businessName}**, an elite ${req.tenant.industry || 'boutique'} in Nairobi.
Stage: ${(profile.stage || 'QUALIFICATION').toUpperCase()}
Catalog: ${JSON.stringify(req.tenant.catalog, null, 2)}
Tone: ${(req.tenant.tone || 'luxury_chic').toUpperCase()}
Directives:
1. Mirror the user's language naturally (Sheng, Swahili, Kenyan English, or mixed).
2. Concise 1-3 sentences. Quote catalog prices clearly in KSh.
3. If they want to pay or buy, prompt for their Safaricom M-Pesa line.
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
  let cleanPhone = String(testPhone || "254700000000").replace(/\D/g, '').trim();
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
// 6. META GRAPH API (INSTAGRAM & FACEBOOK)
// ==========================================
const META_GRAPH_VERSION = 'v21.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

async function publishToInstagram({ igUserId, pageAccessToken, mediaUrl, caption, mediaType = 'IMAGE' }) {
  if (!igUserId || !pageAccessToken) {
    throw new Error('Missing Instagram Business ID or Page Access Token.');
  }

  const containerPayload = {
    caption,
    access_token: pageAccessToken
  };

  if (mediaType === 'REELS' || mediaType === 'VIDEO') {
    containerPayload.media_type = 'REELS';
    containerPayload.video_url = mediaUrl;
    containerPayload.share_to_feed = true;
  } else {
    containerPayload.image_url = mediaUrl;
  }

  const containerRes = await axios.post(`${META_GRAPH_BASE}/${igUserId}/media`, containerPayload, { timeout: 30000 });
  const containerId = containerRes.data?.id;
  if (!containerId) throw new Error('Failed to create Instagram media container');

  if (mediaType === 'REELS' || mediaType === 'VIDEO') {
    let isReady = false;
    let attempts = 0;
    while (!isReady && attempts < 20) {
      await sleep(3000);
      attempts++;
      const statusRes = await axios.get(`${META_GRAPH_BASE}/${containerId}`, {
        params: { fields: 'status_code,status', access_token: pageAccessToken }
      });
      const statusCode = statusRes.data?.status_code;
      if (statusCode === 'FINISHED') {
        isReady = true;
      } else if (statusCode === 'ERROR') {
        throw new Error(`Media container processing failed: ${statusRes.data?.status || 'Unknown error'}`);
      }
    }
    if (!isReady) throw new Error('Instagram media container timed out while processing.');
  }

  const publishRes = await axios.post(`${META_GRAPH_BASE}/${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: pageAccessToken
  }, { timeout: 30000 });

  return publishRes.data?.id;
}

async function publishToFacebook({ pageId, pageAccessToken, mediaUrl, caption }) {
  if (!pageId || !pageAccessToken) {
    throw new Error('Missing Facebook Page ID or Page Access Token.');
  }

  if (mediaUrl) {
    const res = await axios.post(`${META_GRAPH_BASE}/${pageId}/photos`, {
      url: mediaUrl,
      caption: caption,
      access_token: pageAccessToken
    }, { timeout: 30000 });
    return res.data?.post_id || res.data?.id;
  } else {
    const res = await axios.post(`${META_GRAPH_BASE}/${pageId}/feed`, {
      message: caption,
      access_token: pageAccessToken
    }, { timeout: 30000 });
    return res.data?.id;
  }
}

// ==========================================
// 7. CAMPAIGN MANAGEMENT & DISPATCH
// ==========================================
app.get('/api/tenant/campaigns/posts', tenantMiddleware, async (req, res) => {
  try {
    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/scheduled_posts?tenant_id=eq.${req.tenant.id}&order=scheduled_at.desc`,
      { headers: supabaseHeaders }
    );
    res.json(response.data || []);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

app.delete('/api/tenant/campaigns/posts/:id', tenantMiddleware, async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Post ID is required." });

  try {
    await axios.delete(
      `${SUPABASE_URL}/rest/v1/scheduled_posts?id=eq.${id}&tenant_id=eq.${req.tenant.id}`,
      { headers: supabaseHeaders }
    );
    res.json({ success: true, message: "Campaign post deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

app.post('/api/tenant/campaigns/schedule', tenantMiddleware, async (req, res) => {
  const { platform, mediaType, mediaUrl, caption, scheduledAt, campaignTag } = req.body;

  if (!caption || !scheduledAt) {
    return res.status(400).json({ error: "Caption and scheduled date/time are required." });
  }

  let processedCaption = caption;
  const escalationPhone = req.tenant.escalationPhone || process.env.AGENT_PHONE_NUMBER || "254700000000";
  const tag = (campaignTag || "PROMO").toUpperCase().replace(/\s+/g, '_');
  const whatsappUrl = `https://wa.me/${escalationPhone}?text=Hello%2C%20I%20saw%20your%20post%20regarding%20${encodeURIComponent(tag)}`;

  if (!processedCaption.includes('wa.me')) {
    processedCaption += `\n\n💬 Order / Inquire via WhatsApp: ${whatsappUrl}`;
  }

  let cleanMediaUrl = mediaUrl || null;
  const serverBaseUrl = (process.env.SERVER_URL || "https://luvonq.changelens.africa").replace(/\/$/, "");
  if (!cleanMediaUrl && (mediaType === 'REELS' || mediaType === 'VIDEO')) {
    cleanMediaUrl = `${serverBaseUrl}/luvon-demo.mp4`;
  }

  try {
    const postRecord = {
      tenant_id: req.tenant.id,
      platform: platform || 'both',
      media_type: mediaType || 'IMAGE',
      media_url: cleanMediaUrl,
      caption: processedCaption,
      campaign_tag: tag,
      status: 'scheduled',
      scheduled_at: new Date(scheduledAt).toISOString()
    };

    const response = await axios.post(
      `${SUPABASE_URL}/rest/v1/scheduled_posts`,
      postRecord,
      { headers: supabaseHeaders }
    );

    res.status(201).json({ success: true, post: response.data?.[0] || postRecord });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

app.post('/api/tenant/campaigns/credentials', tenantMiddleware, async (req, res) => {
  const { pageId, pageAccessToken, igBusinessId } = req.body;

  if (pageId !== undefined) req.tenant.metaPageId = pageId;
  if (pageAccessToken !== undefined) req.tenant.metaPageAccessToken = pageAccessToken;
  if (igBusinessId !== undefined) req.tenant.metaIgBusinessId = igBusinessId;
  saveStore();

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/tenants?id=eq.${req.tenant.id}`,
    {
      meta_page_id: pageId || null,
      meta_page_access_token: pageAccessToken || null,
      meta_ig_business_id: igBusinessId || null
    },
    { headers: supabaseHeaders }
  ).catch(() => {});

  res.json({ success: true, message: "Meta publishing credentials saved successfully." });
});

// Background Dispatch Cron Worker (Every 60 seconds)
cron.schedule('* * * * *', async () => {
  const now = new Date().toISOString();

  try {
    const { data: duePosts } = await axios.get(
      `${SUPABASE_URL}/rest/v1/scheduled_posts?status=eq.scheduled&scheduled_at=lte.${now}&limit=10`,
      { headers: supabaseHeaders }
    );

    if (!duePosts || duePosts.length === 0) return;

    for (const post of duePosts) {
      await axios.patch(
        `${SUPABASE_URL}/rest/v1/scheduled_posts?id=eq.${post.id}`,
        { status: 'publishing' },
        { headers: supabaseHeaders }
      ).catch(() => {});

      const tenant = db.tenants[post.tenant_id] || db.tenants["luvon_q_flagship"];
      const pageToken = tenant?.metaPageAccessToken || process.env.META_PAGE_ACCESS_TOKEN;
      const pageId = tenant?.metaPageId || process.env.META_PAGE_ID;
      const igId = tenant?.metaIgBusinessId || process.env.META_IG_BUSINESS_ID;

      let publishedIds = [];
      let errorMessage = null;

      try {
        if ((post.platform === 'instagram' || post.platform === 'both') && igId) {
          const igMediaId = await publishToInstagram({
            igUserId: igId,
            pageAccessToken: pageToken,
            mediaUrl: post.media_url,
            caption: post.caption,
            mediaType: post.media_type
          });
          publishedIds.push(`IG:${igMediaId}`);
        }

        if ((post.platform === 'facebook' || post.platform === 'both') && pageId) {
          const fbPostId = await publishToFacebook({
            pageId: pageId,
            pageAccessToken: pageToken,
            mediaUrl: post.media_url,
            caption: post.caption
          });
          publishedIds.push(`FB:${fbPostId}`);
        }

        await axios.patch(
          `${SUPABASE_URL}/rest/v1/scheduled_posts?id=eq.${post.id}`,
          {
            status: 'published',
            published_at: new Date().toISOString(),
            platform_post_id: publishedIds.join(' | ') || 'PUBLISHED_DIRECT'
          },
          { headers: supabaseHeaders }
        );
      } catch (dispatchErr) {
        errorMessage = dispatchErr.response?.data?.error?.message || dispatchErr.message;
        await axios.patch(
          `${SUPABASE_URL}/rest/v1/scheduled_posts?id=eq.${post.id}`,
          {
            status: 'failed',
            error_message: errorMessage
          },
          { headers: supabaseHeaders }
        ).catch(() => {});
      }
    }
  } catch (cronErr) {
    console.error("Campaign scheduler error:", cronErr.message);
  }
});

// ==========================================
// 8. DARAJA GATEWAY (STRICT ENV ONLY)
// ==========================================
let cachedDarajaToken = null;
let tokenExpiryTime = 0;

async function getHardcodedDarajaToken(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedDarajaToken && now < tokenExpiryTime) return cachedDarajaToken;

  if (!HC_CONSUMER_KEY || !HC_CONSUMER_SECRET) {
    throw new Error("Missing DARAJA_CONSUMER_KEY or DARAJA_CONSUMER_SECRET in .env");
  }

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
    
    if (!HC_SHORTCODE || !HC_PASSKEY) {
      throw new Error("Missing DARAJA_BUSINESS_SHORTCODE or DARAJA_PASSKEY in .env");
    }

    const password = Buffer.from(`${HC_SHORTCODE}${HC_PASSKEY}${timestamp}`).toString('base64');

    let cleanPhone = String(phoneNumber || '').replace(/\D/g, '').trim();
    if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
    if (!cleanPhone.startsWith('254')) cleanPhone = '254' + cleanPhone;
    if (cleanPhone.length !== 12) cleanPhone = "254700000000";

    const serverBaseUrl = (process.env.SERVER_URL || "https://luvonq.changelens.africa").replace(/\/$/, "");
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
  const cleanId = String(customerId || "unknown_customer").replace(/\+/g, '').trim();
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
  let cleanPhone = String(toPhone || '').replace(/\D/g, '').trim();
  if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
  if (!cleanPhone.startsWith('254')) cleanPhone = '254' + cleanPhone;
  const phoneId = tenant.whatsappPhoneId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";

  const res = await axios.post(
    `https://graph.facebook.com/v20.0/${phoneId}/messages`,
    { messaging_product: 'whatsapp', to: cleanPhone, type: 'text', text: { body: String(text).trim() } },
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
  );
  return res.data;
}

// ==========================================
// 9. LIVE META WEBHOOK
// ==========================================
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message || message.type !== 'text') return;

    const messageId = message.id;
    if (db.processedMessageIds && db.processedMessageIds.includes(messageId)) {
      return;
    }
    db.processedMessageIds.push(messageId);

    const fromPhone = message.from || value?.contacts?.[0]?.wa_id;
    if (!fromPhone) return;

    const userText = message.text?.body || "";
    const recipientPhoneId = value?.metadata?.phone_number_id;

    const tenant = resolveTenant(recipientPhoneId);
    const { profile } = getOrCreateCustomerSession(tenant, fromPhone, 'whatsapp');

    profile.conversationHistory.push({
      role: 'user',
      text: userText,
      timestamp: new Date().toISOString()
    });
    profile.lastInteraction = new Date().toISOString();
    saveStore();

    if (profile.isPaused) return;

    const systemPrompt = `
You are the elite AI sales concierge for **${tenant.businessName}**, an e-commerce brand in Nairobi.
Stage: ${(profile.stage || 'QUALIFICATION').toUpperCase()}
Catalog: ${JSON.stringify(tenant.catalog, null, 2)}
Tone: ${(tenant.tone || 'luxury_chic').toUpperCase()}
Directives:
1. Mirror the user's language naturally (Sheng, Swahili, Kenyan English, or mixed Nairobi style).
2. Keep responses concise (1-3 sentences maximum). Quote real catalog prices in KSh.
3. Be warm, helpful, and close deals proactively. When they ask to pay, ask for their M-Pesa line.
`;

    const botReply = await callGeminiAPI(systemPrompt, userText);

    profile.conversationHistory.push({
      role: 'model',
      text: botReply,
      timestamp: new Date().toISOString()
    });
    saveStore();

    await sendWhatsAppText(tenant, fromPhone, botReply);
  } catch (webhookErr) {
    console.error("Webhook processing error:", webhookErr.response?.data || webhookErr.message);
  }
});

app.post('/api/stk-callback', (req, res) => res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" }));

app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.send("Luvon Q API is running.");
});

// ==========================================
// 10. GLOBAL ERROR HANDLER
// ==========================================
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: "Creative file exceeds maximum size limit (50MB). Please select a compressed image or video."
    });
  }
  res.status(err.status || 500).json({ error: err.message || "An unexpected error occurred." });
});

// ==========================================
// 11. SERVER BOOTSTRAP
// ==========================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Luvon Q Multi-Tenant Engine running on port ${PORT} (0.0.0.0)`);
});

module.exports = app;