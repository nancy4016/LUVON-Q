// ==========================================
// 1. STATE MANAGEMENT & API SYNC
// ==========================================
let conversations = [];
let activeConvId = null;
let isSending = false;
let lastMessageCount = 0;

const BASE_ORIGIN = (typeof window !== 'undefined' && window.location.origin && window.location.origin.includes('http') && !window.location.origin.includes('localhost'))
  ? window.location.origin
  : 'https://luvon-engine.onrender.com';
const BACKEND_URL = `${BASE_ORIGIN}/api/tenant`;

function getActiveTenantId() {
  return localStorage.getItem('luvon_active_tenant_id') || 'anonymous';
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const inner = document.getElementById('toast-inner');
  const msg = document.getElementById('toast-msg');
  if (!toast || !inner || !msg) return;

  msg.textContent = message;
  if (type === 'success') {
    inner.className = "px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-xs font-semibold border bg-emerald-900 text-emerald-100 border-emerald-700";
  } else if (type === 'error') {
    inner.className = "px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-xs font-semibold border bg-rose-900 text-rose-100 border-rose-700";
  } else {
    inner.className = "px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-xs font-semibold border bg-stone-900 text-brand-100 border-brand-700";
  }

  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 4000);
}

async function fetchLiveConversations() {
  const tenantId = getActiveTenantId();
  if (tenantId === 'anonymous') {
    conversations = [];
    activeConvId = null;
    renderThreads();
    renderChatStream();
    return;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/conversations`, {
      headers: { 
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId 
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rawChats = await res.json();

    if (Array.isArray(rawChats) && rawChats.length > 0) {
      conversations = rawChats.map((c, index) => {
        const cId = String(c.customerId || c.customer_id || c.phone || `conv_${index}`);
        return {
          id: cId,
          customerId: cId,
          customerName: c.customerName || c.customer_name || `Customer +${cId.replace(/^\+/, '')}`,
          customerPhone: cId.startsWith('+') ? cId : `+${cId}`,
          channel: c.channel || 'whatsapp',
          stage: c.stage || 'QUALIFICATION',
          isPaused: Boolean(c.isPaused || c.is_paused),
          messages: (c.conversationHistory || c.messages || []).map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            text: m.text || m.body || '',
            timestamp: m.timestamp 
              ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
              : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }))
        };
      });

      if (!activeConvId || !conversations.some(c => c.id === activeConvId)) {
        activeConvId = conversations[0].id;
      }
    } else {
      conversations = [];
      activeConvId = null;
    }

    renderThreads();

    const activeConv = conversations.find(c => c.id === activeConvId);
    const currentCount = activeConv ? activeConv.messages.length : 0;
    if (currentCount !== lastMessageCount) {
      lastMessageCount = currentCount;
      renderChatStream();
    }
  } catch (err) {
    console.error('Failed to load conversations:', err.message);
  }
}

// ==========================================
// 2. DOM RENDERING (THREADS & STREAM)
// ==========================================
function renderThreads() {
  const container = document.getElementById("threads-container");
  if (!container) return;

  const tenantId = getActiveTenantId();
  if (tenantId === 'anonymous') {
    container.innerHTML = `
      <div class="p-6 text-center text-stone-400 text-xs">
        Please sign in to view customer threads.
      </div>
    `;
    return;
  }

  if (conversations.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-stone-400 text-xs">
        No active chats. Click <b>+ Test Inquiry</b> to simulate a prospect!
      </div>
    `;
    return;
  }

  container.innerHTML = conversations.map(c => {
    const lastMsg = c.messages[c.messages.length - 1];
    const isActive = c.id === activeConvId;

    return `
      <div onclick="selectConversation('${c.id}')" class="p-3.5 cursor-pointer hover:bg-brand-50 transition-colors border-b border-brand-100 ${isActive ? 'bg-brand-100/60 border-l-4 border-brand-600' : ''}">
        <div class="flex items-center justify-between mb-1">
          <span class="font-bold text-xs text-stone-900">${c.customerName}</span>
          <span class="text-[10px] text-stone-400">${lastMsg ? lastMsg.timestamp : ''}</span>
        </div>
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-stone-500 truncate max-w-[160px]">${lastMsg ? lastMsg.text : 'No messages yet'}</p>
          <span class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">${c.channel}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderChatStream() {
  const conv = conversations.find(c => c.id === activeConvId);
  const stream = document.getElementById("chat-stream");

  if (!conv) {
    if (stream) stream.innerHTML = `<div class="h-full flex items-center justify-center text-stone-400 text-xs">No active conversation thread selected.</div>`;
    return;
  }

  const nameEl = document.getElementById("active-name");
  const phoneEl = document.getElementById("active-phone");
  const avatarEl = document.getElementById("active-avatar");
  const stageBadge = document.getElementById("active-stage-badge");

  if (nameEl) nameEl.textContent = conv.customerName || "Customer";
  if (phoneEl) phoneEl.textContent = conv.customerPhone;
  if (avatarEl) avatarEl.textContent = conv.customerName ? conv.customerName.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() : 'LQ';
  if (stageBadge) stageBadge.textContent = conv.stage;

  const toggleBtn = document.getElementById("ai-toggle-btn");
  const toggleLabel = document.getElementById("ai-toggle-label");
  if (toggleBtn && toggleLabel) {
    if (conv.isPaused) {
      toggleBtn.className = "px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-700 hover:bg-rose-800 text-white transition-all flex items-center gap-1.5 shadow-sm cursor-pointer";
      toggleLabel.textContent = "AI Paused (Manager Mode)";
    } else {
      toggleBtn.className = "px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white transition-all flex items-center gap-1.5 shadow-sm cursor-pointer";
      toggleLabel.textContent = "AI Responding";
    }
  }

  if (stream) {
    stream.innerHTML = conv.messages.map(m => {
      const isUser = m.role === 'user';
      return `
        <div class="flex ${isUser ? 'justify-start' : 'justify-end'} mb-2">
          <div class="max-w-[75%] p-3.5 rounded-2xl ${isUser ? 'bg-white border border-brand-200 text-stone-900 rounded-tl-none shadow-sm' : 'bg-brand-900 text-brand-50 rounded-tr-none shadow-md'} space-y-1">
            <p class="text-xs leading-relaxed whitespace-pre-wrap">${m.text}</p>
            <span class="text-[9px] block text-right ${isUser ? 'text-stone-400' : 'text-brand-300'}">${m.timestamp}</span>
          </div>
        </div>
      `;
    }).join('');

    stream.scrollTop = stream.scrollHeight;
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') lucide.createIcons();
}

function selectConversation(id) {
  activeConvId = id;
  const activeConv = conversations.find(c => c.id === activeConvId);
  lastMessageCount = activeConv ? activeConv.messages.length : 0;
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
  conv.isPaused = newStatus;
  renderChatStream();

  try {
    await fetch(`${BACKEND_URL}/conversations/toggle-pause`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': getActiveTenantId()
      },
      body: JSON.stringify({ customerId: conv.customerId, isPaused: newStatus })
    });
    showToast(`AI mode set to: ${newStatus ? 'Paused' : 'Active'}`, 'info');
  } catch (err) {
    showToast('AI mode updated locally', 'info');
  }
}

async function handleSendMessage() {
  if (isSending) return;

  const input = document.getElementById("chat-input");
  if (!input || !input.value.trim()) return;

  let conv = conversations.find(c => c.id === activeConvId);
  if (!conv) {
    showToast("Please select a conversation first", "error");
    return;
  }

  const messageText = input.value.trim();
  input.value = "";
  isSending = true;

  conv.messages.push({
    role: "assistant",
    text: messageText,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });
  lastMessageCount = conv.messages.length;
  renderChatStream();
  renderThreads();

  try {
    const res = await fetch(`${BACKEND_URL}/conversations/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': getActiveTenantId()
      },
      body: JSON.stringify({
        customerId: conv.customerId,
        text: messageText
      })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(`Outbound Notice: ${data.error || 'Failed'}`, 'error');
    } else {
      showToast(`Message delivered to +${conv.customerId}`, 'success');
    }
  } catch (err) {
    console.error("Outbound send notice:", err.message);
  } finally {
    isSending = false;
  }
}

function openTestInquiryModal() {
  if (getActiveTenantId() === 'anonymous') {
    if (typeof openSignInModal === 'function') openSignInModal();
    return;
  }
  document.getElementById("testInquiryModal")?.classList.remove("hidden");
  if (window.lucide && typeof window.lucide.createIcons === 'function') lucide.createIcons();
}

function closeTestInquiryModal() {
  document.getElementById("testInquiryModal")?.classList.add("hidden");
}

function setSimText(text) {
  const textarea = document.getElementById("sim-input-text");
  if (textarea) textarea.value = text.trim();
}

async function executeSimulateInquiry() {
  const text = document.getElementById("sim-input-text")?.value.trim();
  if (!text) {
    showToast("Please enter an inquiry message", "error");
    return;
  }

  closeTestInquiryModal();

  let conv = conversations.find(c => c.id === activeConvId);
  if (!conv) {
    conv = {
      id: "254708374149",
      customerId: "254708374149",
      customerName: "Prospect (Simulated)",
      customerPhone: "+254708374149",
      channel: 'whatsapp',
      stage: 'QUALIFICATION',
      isPaused: false,
      messages: []
    };
    conversations.unshift(conv);
    activeConvId = conv.id;
  }

  conv.messages.push({
    role: "user",
    text: text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });
  lastMessageCount = conv.messages.length;
  renderChatStream();
  renderThreads();

  showToast("Inquiry sent. Generating Gemini response...", "info");

  try {
    const res = await fetch(`${BACKEND_URL}/conversations/simulate-inquiry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': getActiveTenantId()
      },
      body: JSON.stringify({
        customerId: conv.customerId,
        text: text
      })
    });
    const data = await res.json();
    if (data.success && data.botReply) {
      conv.messages.push({
        role: "assistant",
        text: data.botReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      renderChatStream();
      renderThreads();
    }
  } catch (err) {
    showToast("Simulation error: " + err.message, "error");
  }
}

function openQuickSTKModal() {
  const conv = conversations.find(c => c.id === activeConvId);
  if (!conv) {
    showToast("Select a customer chat first", "error");
    return;
  }
  const input = document.getElementById("stk-modal-phone");
  if (input) input.value = conv.customerPhone;
  document.getElementById("quickSTKModal")?.classList.remove("hidden");
  if (window.lucide && typeof window.lucide.createIcons === 'function') lucide.createIcons();
}

function closeQuickSTKModal() {
  document.getElementById("quickSTKModal")?.classList.add("hidden");
}

async function executeQuickSTK() {
  const phoneVal = document.getElementById("stk-modal-phone")?.value.replace(/[^0-9]/g, '') || '254708374149';
  const amountVal = document.getElementById("stk-modal-amount")?.value || '1';

  closeQuickSTKModal();
  showToast(`Dispatching KSh ${amountVal} STK Push to +${phoneVal}...`, "info");

  try {
    const res = await fetch(`${BACKEND_URL}/payments/test-stk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': getActiveTenantId()
      },
      body: JSON.stringify({ testPhone: phoneVal })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`✅ STK Push sent! Handset prompted.`, "success");
    } else {
      showToast(`STK Gateway Rejection: ${data.message || 'Check credentials'}`, "error");
    }
  } catch (err) {
    showToast(`Network Error: ${err.message}`, "error");
  }
}

function handleSearch(query) {
  const q = query.toLowerCase().trim();
  const items = document.querySelectorAll("#threads-container > div");
  items.forEach(el => {
    const text = el.innerText.toLowerCase();
    el.style.display = text.includes(q) ? "" : "none";
  });
}

function toggleMobileMenu() {
  const nav = document.getElementById("sidebarNav");
  const backdrop = document.getElementById("sidebarBackdrop");
  if (!nav || !backdrop) return;
  nav.classList.toggle("-translate-x-full");
  backdrop.classList.toggle("hidden");
}

window.openTestInquiryModal = openTestInquiryModal;
window.closeTestInquiryModal = closeTestInquiryModal;
window.setSimText = setSimText;
window.executeSimulateInquiry = executeSimulateInquiry;
window.openQuickSTKModal = openQuickSTKModal;
window.closeQuickSTKModal = closeQuickSTKModal;
window.executeQuickSTK = executeQuickSTK;
window.fetchLiveConversations = fetchLiveConversations;
window.selectConversation = selectConversation;
window.toggleAIPauseState = toggleAIPauseState;
window.handleSendMessage = handleSendMessage;
window.handleSearch = handleSearch;
window.toggleMobileMenu = toggleMobileMenu;

document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide && typeof window.lucide.createIcons === 'function') lucide.createIcons();
  fetchLiveConversations();
  setInterval(() => {
    if (!isSending) fetchLiveConversations();
  }, 4000);
});