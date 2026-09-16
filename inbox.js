// ==========================================
// 1. STATE MANAGEMENT & API SYNC
// ==========================================
let conversations = [];
let activeConvId = null;
let isSending = false;

const BASE_ORIGIN = (typeof window !== 'undefined' && window.location.origin && window.location.origin.includes('http'))
  ? window.location.origin
  : 'http://localhost:3000';
const BACKEND_URL = `${BASE_ORIGIN}/api/tenant`;
const TENANT_ID = 'luvon_q_flagship';

async function fetchLiveConversations() {
  try {
    const res = await fetch(`${BACKEND_URL}/conversations`, {
      headers: { 
        'Content-Type': 'application/json',
        'x-tenant-id': TENANT_ID 
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rawChats = await res.json();

    if (Array.isArray(rawChats) && rawChats.length > 0) {
      conversations = rawChats.map((c, index) => {
        const cId = String(c.customerId || c.phone || `conv_${index}`);
        return {
          id: cId,
          customerId: cId,
          customerName: c.customerName || `Customer +${cId.replace(/^\+/, '')}`,
          customerPhone: cId.startsWith('+') ? cId : `+${cId}`,
          channel: c.channel || 'whatsapp',
          stage: c.stage || 'QUALIFICATION',
          isPaused: Boolean(c.isPaused),
          messages: (c.conversationHistory || c.messages || []).map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            text: m.text || m.body || '',
            timestamp: m.timestamp 
              ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
              : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }))
        };
      });

      // Default select active or first thread
      if (!activeConvId || !conversations.some(c => c.id === activeConvId)) {
        activeConvId = conversations[0].id;
      }
    } else {
      // If server store is empty, create a starter test customer thread so you can talk to the bot immediately
      if (conversations.length === 0) {
        conversations = [{
          id: "254768820142",
          customerId: "254768820142",
          customerName: "Test Customer (+254768820142)",
          customerPhone: "+254768820142",
          channel: "whatsapp",
          stage: "QUALIFICATION",
          isPaused: false,
          messages: [
            {
              role: "user",
              text: "Niaje, do you have Air Force 1 White in stock?",
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            },
            {
              role: "assistant",
              text: "Niaje! Yes, we have 4 pairs of Air Force 1 White available for KSh 2,500. Would you like to order a pair?",
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]
        }];
        activeConvId = "254768820142";
      }
    }

    renderThreads();
    renderChatStream();
  } catch (err) {
    console.error('❌ Failed to fetch conversations:', err.message);
  }
}

// ==========================================
// 2. DOM RENDERING (THREADS & STREAM)
// ==========================================
function renderThreads() {
  const container = document.getElementById("threads-container");
  if (!container) return;

  if (conversations.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-stone-400 text-xs">
        No active conversations. Send a message below or click "+ Test Inquiry" to start!
      </div>
    `;
    return;
  }

  container.innerHTML = conversations.map(c => {
    const lastMsg = c.messages[c.messages.length - 1];
    const isActive = c.id === activeConvId;
    const channelColor = c.channel === 'whatsapp' 
      ? 'bg-emerald-100 text-emerald-800' 
      : 'bg-stone-100 text-stone-800';

    return `
      <div onclick="selectConversation('${c.id}')" class="p-4 cursor-pointer hover:bg-stone-50 transition-colors border-b border-stone-100 ${isActive ? 'bg-amber-50/70 border-l-4 border-amber-600' : ''}">
        <div class="flex items-center justify-between mb-1">
          <span class="font-bold text-xs text-stone-900">${c.customerName}</span>
          <span class="text-[10px] text-stone-400">${lastMsg ? lastMsg.timestamp : ''}</span>
        </div>
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-stone-500 truncate max-w-[170px]">${lastMsg ? lastMsg.text : 'No messages yet'}</p>
          <span class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${channelColor}">${c.channel}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderChatStream() {
  const conv = conversations.find(c => c.id === activeConvId);
  const stream = document.getElementById("chat-stream");

  if (!conv) {
    if (stream) stream.innerHTML = `<div class="h-full flex items-center justify-center text-stone-400 text-xs">Select a conversation thread to view the live chat.</div>`;
    return;
  }

  // Update Top Bar Details
  const nameEl = document.getElementById("active-name");
  const phoneEl = document.getElementById("active-phone");
  const avatarEl = document.getElementById("active-avatar");
  const channelBadge = document.getElementById("active-channel-badge");
  const stageBadge = document.getElementById("active-stage-badge");

  if (nameEl) nameEl.textContent = conv.customerName || "Customer";
  if (phoneEl) phoneEl.textContent = conv.customerPhone;
  if (avatarEl) avatarEl.textContent = conv.customerName ? conv.customerName.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() : 'C';

  if (channelBadge) {
    channelBadge.textContent = conv.channel;
    channelBadge.className = `px-2 py-0.5 text-[9px] font-extrabold uppercase rounded ${conv.channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-800'}`;
  }

  if (stageBadge) {
    stageBadge.textContent = conv.stage;
  }

  // Update AI State Toggle Button
  const toggleBtn = document.getElementById("ai-toggle-btn");
  const toggleLabel = document.getElementById("ai-toggle-label");
  if (toggleBtn && toggleLabel) {
    if (conv.isPaused) {
      toggleBtn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-all flex items-center gap-1.5 shadow-sm cursor-pointer";
      toggleLabel.textContent = "AI Paused (Manager Mode)";
    } else {
      toggleBtn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-all flex items-center gap-1.5 shadow-sm cursor-pointer";
      toggleLabel.textContent = "AI Responding";
    }
  }

  // Render Chat Messages
  if (stream) {
    stream.innerHTML = conv.messages.map(m => {
      const isUser = m.role === 'user';
      return `
        <div class="flex ${isUser ? 'justify-start' : 'justify-end'} mb-3">
          <div class="max-w-[75%] p-3.5 rounded-2xl ${isUser ? 'bg-white border border-stone-200 text-stone-900 rounded-tl-none shadow-sm' : 'bg-stone-900 text-white rounded-tr-none shadow-md'} space-y-1">
            <p class="text-xs leading-relaxed whitespace-pre-wrap">${m.text}</p>
            <span class="text-[9px] block text-right text-stone-400">${m.timestamp}</span>
          </div>
        </div>
      `;
    }).join('');

    stream.scrollTop = stream.scrollHeight;
  }
}

function selectConversation(id) {
  activeConvId = id;
  renderThreads();
  renderChatStream();
}

// ==========================================
// 3. AI OVERRIDE & USER ACTIONS
// ==========================================
async function toggleAIPauseState() {
  const conv = conversations.find(c => c.id === activeConvId);
  if (!conv) return;

  const newStatus = !conv.isPaused;

  try {
    await fetch(`${BACKEND_URL}/conversations/toggle-pause`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': TENANT_ID
      },
      body: JSON.stringify({ customerId: conv.customerId, isPaused: newStatus })
    });

    conv.isPaused = newStatus;
    renderChatStream();
  } catch (err) {
    console.warn('AI state toggled locally:', err.message);
    conv.isPaused = newStatus;
    renderChatStream();
  }
}

async function handleSendMessage() {
  if (isSending) return;

  const input = document.getElementById("chat-input");
  if (!input || !input.value.trim()) return;

  let conv = conversations.find(c => c.id === activeConvId);

  // If no conversation exists, select the first or create a default test one
  if (!conv) {
    conv = {
      id: "254768820142",
      customerId: "254768820142",
      customerName: "Test Customer (+254768820142)",
      customerPhone: "+254768820142",
      channel: 'whatsapp',
      stage: 'QUALIFICATION',
      isPaused: false,
      messages: []
    };
    conversations.unshift(conv);
    activeConvId = conv.id;
  }

  const messageText = input.value.trim();
  input.value = "";
  isSending = true;

  // Append outgoing bubble to UI
  conv.messages.push({
    role: "assistant",
    text: messageText,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });
  renderChatStream();
  renderThreads();

  try {
    await fetch(`${BACKEND_URL}/conversations/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': TENANT_ID
      },
      body: JSON.stringify({
        customerId: conv.customerId,
        text: messageText
      })
    });
  } catch (err) {
    console.error("❌ Send notice:", err.message);
  } finally {
    isSending = false;
  }
}

// ==========================================
// 4. TEST BOT SIMULATOR (SEE BOT IN ACTION)
// ==========================================
async function simulateCustomerInquiry() {
  const sampleInquiries = [
    "Niaje! How much are the Air Force 1s?",
    "Do you have knotless braids available tomorrow?",
    "Can I pay via M-Pesa right now?",
    "Where is your shop located in Nairobi?"
  ];

  const randomPrompt = sampleInquiries[Math.floor(Math.random() * sampleInquiries.length)];
  const userText = prompt("Enter a customer message to test the AI Bot:", randomPrompt);
  if (!userText) return;

  let conv = conversations.find(c => c.id === activeConvId);
  if (!conv) {
    conv = conversations[0];
    activeConvId = conv.id;
  }

  // 1. Add User Message
  conv.messages.push({
    role: "user",
    text: userText,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });
  renderChatStream();
  renderThreads();

  // 2. Trigger Webhook to simulate live WhatsApp incoming message
  try {
    await fetch(`${BASE_ORIGIN}/api/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry: [{
          changes: [{
            value: {
              metadata: { phone_number_id: "1279716021891578" },
              messages: [{
                id: `test_msg_${Date.now()}`,
                from: conv.customerId,
                type: 'text',
                text: { body: userText }
              }]
            }
          }]
        }]
      })
    });

    // Refresh after 2 seconds to see the bot reply
    setTimeout(fetchLiveConversations, 2500);
  } catch (err) {
    console.error("Simulation failed:", err.message);
  }
}

// ==========================================
// 5. INITIALIZATION & REFRESH POLLING
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();

  fetchLiveConversations();

  // Poll for incoming WhatsApp messages every 4 seconds
  setInterval(() => {
    if (!isSending) fetchLiveConversations();
  }, 4000);

  const toggleBtn = document.getElementById("ai-toggle-btn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", toggleAIPauseState);
  }

  const chatForm = document.getElementById("chat-form");
  if (chatForm) {
    chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      handleSendMessage();
    });
  }

  const chatInput = document.getElementById("chat-input");
  if (chatInput) {
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });
  }
});