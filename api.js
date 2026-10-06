// api.js
(function () {
  const BASE_URL = (typeof window !== 'undefined' && window.location.origin && window.location.origin.includes('http'))
    ? window.location.origin
    : 'http://localhost:3000';

  const API_BASE = `${BASE_URL}/api/tenant`;
  const TENANT_ID = 'luvon_q_flagship';

  // ==========================================
  // 1. SUPABASE CLIENT INITIALIZATION
  // ==========================================
  const SUPABASE_URL = 'https://kmwwgmzypjnjfkpoyims.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_DhTvZ4K5YCYLXErehDkBFQ_noylBgEH';

  let supabaseClient = null;

  function initSupabase() {
    if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  }

  if (typeof window !== 'undefined' && !window.supabase) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload = () => {
      initSupabase();
      checkAuthSession();
    };
    document.head.appendChild(script);
  } else if (typeof window !== 'undefined') {
    initSupabase();
  }

  // ==========================================
  // 2. HTTP API CLIENT
  // ==========================================
  async function apiCall(endpoint, options = {}) {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${API_BASE}${cleanEndpoint}`;

    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': TENANT_ID,
        ...(options.headers || {})
      }
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg = data?.message || data?.errorMessage || data?.error || data?.details?.errorMessage || `Request failed with status ${response.status}`;
        throw new Error(errorMsg);
      }
      return data;
    } catch (err) {
      console.error(`API Call failed on [${endpoint}]:`, err.message);
      throw err;
    }
  }

  // ==========================================
  // 3. AUTHENTICATION CONTROLS
  // ==========================================
  let currentAuthMode = 'signin';

  function openSignInModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
    }
  }

  function closeSignInModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.add('hidden');
  }

  function switchAuthTab(mode) {
    currentAuthMode = mode;
    const tabSignIn = document.getElementById('tabSignIn');
    const tabSignUp = document.getElementById('tabSignUp');
    const nameFieldGroup = document.getElementById('nameFieldGroup');
    const submitBtn = document.getElementById('authSubmitBtn');
    const modalTitle = document.getElementById('authModalTitle');

    if (mode === 'signup') {
      tabSignUp?.classList.add('text-brand-600', 'border-brand-600');
      tabSignUp?.classList.remove('text-slate-400', 'border-transparent');
      tabSignIn?.classList.remove('text-brand-600', 'border-brand-600');
      tabSignIn?.classList.add('text-slate-400', 'border-transparent');

      nameFieldGroup?.classList.remove('hidden');
      if (submitBtn) submitBtn.textContent = 'Create Merchant Account';
      if (modalTitle) modalTitle.textContent = 'Join Luvon Q Orélune';
    } else {
      tabSignIn?.classList.add('text-brand-600', 'border-brand-600');
      tabSignIn?.classList.remove('text-slate-400', 'border-transparent');
      tabSignUp?.classList.remove('text-brand-600', 'border-brand-600');
      tabSignUp?.classList.add('text-slate-400', 'border-transparent');

      nameFieldGroup?.classList.add('hidden');
      if (submitBtn) submitBtn.textContent = 'Authenticate Session';
      if (modalTitle) modalTitle.textContent = 'Sign in to Orélune OS';
    }
  }

  async function handleCustomerAuth(e) {
    if (e) e.preventDefault();

    if (!supabaseClient) {
      initSupabase();
      if (!supabaseClient) {
        alert('Authentication module loading... Please try again in 2 seconds.');
        return;
      }
    }

    const email = document.getElementById('email')?.value?.trim();
    const password = document.getElementById('password')?.value;
    const fullName = document.getElementById('fullName')?.value?.trim() || 'Luvon Merchant';
    const submitBtn = document.getElementById('authSubmitBtn');

    if (!email || !password) return;

    const originalText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Authenticating...';
    }

    try {
      if (currentAuthMode === 'signup') {
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, tenant_id: TENANT_ID } }
        });
        if (error) throw error;
        alert('Account registered! Check your email to confirm registration or sign in directly.');
        switchAuthTab('signin');
      } else {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
        closeSignInModal();
        updateAuthUI(data.user);
      }
    } catch (err) {
      alert('Authentication error: ' + err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
  }

  async function checkAuthSession() {
    if (!supabaseClient) initSupabase();
    if (!supabaseClient) return;

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session?.user) {
        updateAuthUI(session.user);
      }
    } catch (err) {
      console.warn('Session verification notice:', err.message);
    }
  }

  async function toggleSignOut() {
    if (!supabaseClient) initSupabase();
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
    const signInBtn = document.getElementById('portalSignInBtn');
    const tenantCard = document.getElementById('activeTenantCard');
    if (signInBtn) signInBtn.classList.remove('hidden');
    if (tenantCard) tenantCard.classList.add('hidden');
  }

  function updateAuthUI(user) {
    const signInBtn = document.getElementById('portalSignInBtn');
    const tenantCard = document.getElementById('activeTenantCard');
    const tenantNameEl = document.getElementById('tenantName');

    if (signInBtn) signInBtn.classList.add('hidden');
    if (tenantCard) tenantCard.classList.remove('hidden');
    if (tenantNameEl) {
      tenantNameEl.textContent = user.user_metadata?.full_name || user.email.split('@')[0];
    }
    if (window.lucide) lucide.createIcons();
  }

  // ==========================================
  // 4. API BINDINGS
  // ==========================================
  const API = {
    getSettings: () => apiCall('/settings'),
    saveSettings: (payload) => apiCall('/settings/personality', { method: 'POST', body: JSON.stringify(payload) }),
    getInventory: () => apiCall('/inventory'),
    saveInventoryItem: (item) => apiCall('/inventory', { method: 'POST', body: JSON.stringify(item) }),
    getMetrics: () => apiCall('/metrics'),
    getConversations: () => apiCall('/conversations'),
    togglePause: (customerId, isPaused) => apiCall('/conversations/toggle-pause', { 
      method: 'POST', 
      body: JSON.stringify({ customerId, isPaused }) 
    }),
    sendMessage: (customerId, text) => apiCall('/conversations/send-message', {
      method: 'POST',
      body: JSON.stringify({ customerId, text })
    }),
    saveDarajaSettings: (payload) => apiCall('/payments/daraja', { method: 'POST', body: JSON.stringify(payload) }),
    triggerTestSTK: (testPhone) => apiCall('/payments/test-stk', { method: 'POST', body: JSON.stringify({ testPhone }) }),
    previewVoice: (voiceId, text) => fetch(`${API_BASE}/voice/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': TENANT_ID },
      body: JSON.stringify({ voiceId, text })
    })
  };

  window.API = API;
  window.apiCall = apiCall;
  window.openSignInModal = openSignInModal;
  window.closeSignInModal = closeSignInModal;
  window.switchAuthTab = switchAuthTab;
  window.handleCustomerAuth = handleCustomerAuth;
  window.toggleSignOut = toggleSignOut;

  document.addEventListener('DOMContentLoaded', () => {
    checkAuthSession();
  });
})();