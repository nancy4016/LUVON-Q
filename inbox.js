// Sample Dynamic Conversations matching Prisma Database Schema
const conversations = [
  {
    id: "conv_1",
    customerName: "Faith K.",
    customerPhone: "+254 712 987 654",
    channel: "whatsapp",
    stage: "CLOSING",
    isPaused: false,
    messages: [
      { role: "user", text: "Niaje! Is the Air Force 1 White pair in size 41 available?", timestamp: "10:14 AM" },
      { role: "assistant", text: "Niaje! Yes, we have 4 pairs of Air Force 1 White left in size 41 at KSh 2,500. Would you like me to trigger an M-Pesa STK push for checkout?", timestamp: "10:15 AM" },
      { role: "user", text: "Eeh niko ready, send the M-Pesa prompt.", timestamp: "10:16 AM" }
    ]
  },
  {
    id: "conv_2",
    customerName: "Brian O.",
    customerPhone: "+254 701 234 567",
    channel: "instagram",
    stage: "QUALIFICATION",
    isPaused: false,
    messages: [
      { role: "user", text: "Hey! How much is the Jordan 4 Retro Black?", timestamp: "09:30 AM" },
      { role: "assistant", text: "Welcome to Nairobi Kicks Studio! The Jordan 4 Retro Black is priced at KSh 4,800. Currently out of stock, but we can reserve the next drop for you!", timestamp: "09:31 AM" }
    ]
  },
  {
    id: "conv_3",
    customerName: "Amina M.",
    customerPhone: "+254 733 456 789",
    channel: "tiktok",
    stage: "POST_PURCHASE",
    isPaused: true,
    messages: [
      { role: "user", text: "I completed the M-Pesa payment, receipt code QKH8923KL.", timestamp: "Yesterday" },
      { role: "assistant", text: "Payment received! Your order is being packaged for dispatch to Kasarani, Nairobi.", timestamp: "Yesterday" }
    ]
  }
];

let activeConvId = "conv_1";

function renderThreads() {
  const container = document.getElementById("threads-container");
  if (!container) return;

  container.innerHTML = conversations.map(c => {
    const lastMsg = c.messages[c.messages.length - 1];
    const isActive = c.id === activeConvId;
    const channelColor = c.channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-800' : c.channel === 'instagram' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-800';

    return `
      <div onclick="selectConversation('${c.id}')" class="p-4 cursor-pointer hover:bg-brand-50 transition-colors ${isActive ? 'bg-brand-100/60 border-l-4 border-brand-600' : ''}">
        <div class="flex items-center justify-between mb-1">
          <span class="font-bold text-xs text-brand-900">${c.customerName || c.customerPhone}</span>
          <span class="text-[10px] text-slate-400">${lastMsg ? lastMsg.timestamp : ''}</span>
        </div>
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-slate-500 truncate max-w-[170px]">${lastMsg ? lastMsg.text : 'No messages'}</p>
          <span class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${channelColor}">${c.channel}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderChatStream() {
  const conv = conversations.find(c => c.id === activeConvId);
  if (!conv) return;

  // Update Header UI
  document.getElementById("active-name").textContent = conv.customerName || "Customer";
  document.getElementById("active-phone").textContent = conv.customerPhone;
  document.getElementById("active-avatar").textContent = conv.customerName ? conv.customerName.split(' ').map(n=>n[0]).join('') : 'C';
  
  const channelBadge = document.getElementById("active-channel-badge");
  channelBadge.textContent = conv.channel;
  channelBadge.className = `px-2 py-0.5 text-[9px] font-extrabold uppercase rounded ${conv.channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-800' : conv.channel === 'instagram' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-800'}`;

  const stageBadge = document.getElementById("active-stage-badge");
  stageBadge.textContent = conv.stage;

  // Update AI Toggle Button State
  const toggleBtn = document.getElementById("ai-toggle-btn");
  const toggleLabel = document.getElementById("ai-toggle-label");
  if (conv.isPaused) {
    toggleBtn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-all flex items-center gap-1.5 shadow-sm";
    toggleLabel.textContent = "AI Paused (Manager Mode)";
  } else {
    toggleBtn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-all flex items-center gap-1.5 shadow-sm";
    toggleLabel.textContent = "AI Responding";
  }

  // Render Messages
  const stream = document.getElementById("chat-stream");
  stream.innerHTML = conv.messages.map(m => {
    const isUser = m.role === 'user';
    return `
      <div class="flex ${isUser ? 'justify-start' : 'justify-end'}">
        <div class="max-w-[75%] p-3.5 rounded-2xl ${isUser ? 'bg-white border border-brand-200 text-brand-900 rounded-tl-none' : 'bg-brand-600 text-white rounded-tr-none shadow-md'} space-y-1">
          <p class="text-xs leading-relaxed">${m.text}</p>
          <span class="text-[9px] block text-right ${isUser ? 'text-slate-400' : 'text-brand-100/70'}">${m.timestamp}</span>
        </div>
      </div>
    `;
  }).join('');

  stream.scrollTop = stream.scrollHeight;
}

function selectConversation(id) {
  activeConvId = id;
  renderThreads();
  renderChatStream();
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();
  
  renderThreads();
  renderChatStream();

  // Toggle AI Pause Handler
  document.getElementById("ai-toggle-btn")?.addEventListener("click", () => {
    const conv = conversations.find(c => c.id === activeConvId);
    if (conv) {
      conv.isPaused = !conv.isPaused;
      renderChatStream();
    }
  });

  // Message Send Form
  document.getElementById("chat-form")?.addEventListener("click", (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
      e.preventDefault();
      const input = document.getElementById("chat-input");
      if (!input.value.trim()) return;

      const conv = conversations.find(c => c.id === activeConvId);
      if (conv) {
        conv.messages.push({
          role: "assistant",
          text: input.value.trim(),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        input.value = "";
        renderChatStream();
        renderThreads();
      }
    }
  });
});