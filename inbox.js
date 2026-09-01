// ==========================================
// 1. STATE MANAGEMENT & API SYNC
// ==========================================
let conversations = [];
let activeConvId = null;

const BACKEND_URL = 'http://localhost:3000/api/tenant';
const TENANT_ID = 'luvon_q_flagship';

async function fetchLiveConversations() {
  try {
    const rawChats = typeof apiCall === 'function'
      ? await apiCall('/conversations')
      : await (await fetch(`${BACKEND_URL}/conversations`, {
          headers: { 'x-tenant-id': TENANT_ID }
        })).json();

    if (Array.isArray(rawChats) && rawChats.length > 0) {
      conversations = rawChats.map((c, index) => ({
        id: c.customerId || `conv_${index}`,
        customerId: c.customerId,
        customerName: c.customerName || `Customer +${c.customerId}`,
        customerPhone: `+${c.customerId}`,
        channel: c.channel || 'whatsapp',
        stage: c.stage || 'QUALIFICATION',
        isPaused: Boolean(c.isPaused),
        messages: (c.conversationHistory || []).map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          text: m.text,
          timestamp: m.timestamp 
            ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
            : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }))
      }));

      // Maintain active conversation selection or default to first
      if (!activeConvId || !conversations.some(c => c.id === activeConvId)) {
        activeConvId = conversations[0].id;
      }
    } else {
      conversations = [];
      activeConvId = null;
    }

    renderThreads();
    renderChatStream();
  } catch (err) {
    console.error('❌ Failed to fetch conversations from server:', err.message);
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
      <div class="p-6 text-center text-slate-400 text-xs">
        No active conversations found. Messages sent to your WhatsApp number will appear here automatically.
      </div>
    `;
    return;
  }

  container.innerHTML = conversations.map(c => {
    const lastMsg = c.messages[c.messages.length - 1];
    const isActive = c.id === activeConvId;
    const channelColor = c.channel === 'whatsapp' 
      ? 'bg-emerald-100 text-emerald-800' 
      : c.channel === 'instagram' 
      ? 'bg-purple-100 text-purple-800' 
      : 'bg-slate-100 text-slate-800';

    return `
      <div onclick="selectConversation('${c.id}')" class="p-4 cursor-pointer hover:bg-stone-50 transition-colors border-b border-stone-100 ${isActive ? 'bg-amber-50/70 border-l-4 border-amber-600' : ''}">
        <div class="flex items-center justify-between mb-1">
          <span class="font-bold text-xs text-stone-900">${c.customerName || c.customerPhone}</span>
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
    if (stream) stream.innerHTML = `<div class="h-full flex items-center justify-center text-slate-400 text-xs">Select a conversation thread to view the live chat.</div>`;
    return;
  }

  // Update Top Bar UI Info
  const nameEl = document.getElementById("active-name");
  const phoneEl = document.getElementById("active-phone");
  const avatarEl = document.getElementById("active-avatar");
  const channelBadge = document.getElementById("active-channel-badge");
  const stageBadge = document.getElementById("active-stage-badge");

  if (nameEl) nameEl.textContent = conv.customerName || "Customer";
  if (phoneEl) phoneEl.textContent = conv.customerPhone;
  if (avatarEl) avatarEl.textContent = conv.customerName ? conv.customerName.split(' ').map(n=>n[0]).join('') : 'C';

  if (channelBadge) {
    channelBadge.textContent = conv.channel;
    channelBadge.className = `px-2 py-0.5 text-[9px] font-extrabold uppercase rounded ${conv.channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-800' : conv.channel === 'instagram' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-800'}`;
  }

  if (stageBadge) {
    stageBadge.textContent = conv.stage;
  }

  // Update AI Mode Toggle Button
  const toggleBtn = document.getElementById("ai-toggle-btn");
  const toggleLabel = document.getElementById("ai-toggle-label");
  if (toggleBtn && toggleLabel) {
    if (conv.isPaused) {
      toggleBtn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-all flex items-center gap-1.5 shadow-sm";
      toggleLabel.textContent = "AI Paused (Manager Mode)";
    } else {
      toggleBtn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-all flex items-center gap-1.5 shadow-sm";
      toggleLabel.textContent = "AI Responding";
    }
  }

  // Populate Message Bubbles
  if (stream) {
    stream.innerHTML = conv.messages.map(m => {
      const isUser = m.role === 'user';
      return `
        <div class="flex ${isUser ? 'justify-start' : 'justify-end'} mb-3">
          <div class="max-w-[75%] p-3.5 rounded-2xl ${isUser ? 'bg-white border border-stone-200 text-stone-900 rounded-tl-none shadow-sm' : 'bg-stone-900 text-white rounded-tr-none shadow-md'} space-y-1">
            <p class="text-xs leading-relaxed whitespace-pre-wrap">${m.text}</p>
            <span class="text-[9px] block text-right ${isUser ? 'text-stone-400' : 'text-stone-400'}">${m.timestamp}</span>
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
    if (typeof apiCall === 'function') {
      await apiCall('/conversations/toggle-pause', {
        method: 'POST',
        body: JSON.stringify({ customerId: conv.customerId, isPaused: newStatus })
      });
    } else {
      await fetch(`${BACKEND_URL}/conversations/toggle-pause`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': TENANT_ID
        },
        body: JSON.stringify({ customerId: conv.customerId, isPaused: newStatus })
      });
    }

    conv.isPaused = newStatus;
    renderChatStream();
  } catch (err) {
    alert('Failed to update AI state on server: ' + err.message);
  }
}

async function handleSendMessage() {
  const input = document.getElementById("chat-input");
  if (!input || !input.value.trim()) return;

  const conv = conversations.find(c => c.id === activeConvId);
  if (!conv) return;

  const messageText = input.value.trim();
  input.value = "";

  // Optimistic UI Append
  conv.messages.push({
    role: "assistant",
    text: messageText,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });
  renderChatStream();
  renderThreads();

  // Send directly to WhatsApp via Backend
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
    fetchLiveConversations();
  } catch (err) {
    console.error("❌ Failed to deliver manager message:", err.message);
  }
}

// ==========================================
// 4. INITIALIZATION & REFRESH POLLING
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();

  fetchLiveConversations();

  // Poll for incoming WhatsApp messages every 3 seconds
  setInterval(fetchLiveConversations, 3000);

  // Toggle AI Pause Event
  document.getElementById("ai-toggle-btn")?.addEventListener("click", toggleAIPauseState);

  // Send Manual Message Form Button Event
  const chatForm = document.getElementById("chat-form");
  if (chatForm) {
    chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      handleSendMessage();
    });
  }

  // Click on Send button inside container
  document.addEventListener("click", (e) => {
    if (e.target.closest("#send-btn") || e.target.closest("button:has([data-lucide='send'])")) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Enter Key Listener on Chat Input
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