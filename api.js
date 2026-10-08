// api.js - Luvon Q Production Client Bridge
(function () {
  const BASE_URL = (typeof window !== 'undefined' && window.location.origin && window.location.origin.includes('http') && !window.location.origin.includes('localhost'))
    ? window.location.origin
    : 'https://luvon-engine.onrender.com';

  function getActiveTenantId() {
    return localStorage.getItem('luvon_active_tenant_id') || 'luvon_q_flagship';
  }

  // Modern Toast Notification Engine (No native browser alerts)
  function showNotification(message, type = 'info') {
    let container = document.getElementById('luvon-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'luvon-toast-container';
      container.className = 'fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `p-4 rounded-xl shadow-2xl flex items-center gap-3 text-xs font-semibold border pointer-events-auto transition-all duration-300 transform translate-y-3 opacity-0 ${
      type === 'success' 
        ? 'bg-stone-900 text-brand-100 border-brand-500/50' 
        : type === 'error'
        ? 'bg-rose-950 text-rose-100 border-rose-800'
        : 'bg-stone-900 text-stone-200 border-stone-800'
    }`;

    const indicatorHtml = type === 'success' 
      ? '<span class="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 animate-ping"></span>' 
      : type === 'error'
      ? '<span class="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0"></span>'
      : '<span class="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0"></span>';

    toast.innerHTML = `${indicatorHtml}<div class="flex-1 leading-snug">${message}</div>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-3', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-3');
      setTimeout(() => toast.remove(), 350);
    }, 4500);
  }

  async function apiCall(endpoint, options = {}) {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${BASE_URL}/api/tenant${cleanEndpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      'x-tenant-id': getActiveTenantId(),
      ...(options.headers || {})
    };

    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data?.message || data?.error || `Request failed (${res.status})`);
    }
    return data;
  }

  // Auth Modal Handlers
  let currentAuthMode = 'signin';

  function openSignInModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.classList.remove('hidden');
      if (window.lucide && typeof window.lucide.createIcons === 'function') lucide.createIcons();
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
    const nameField = document.getElementById('nameFieldGroup');
    const submitBtn = document.getElementById('authSubmitBtn');
    const modalTitle = document.getElementById('authModalTitle');

    if (mode === 'signup') {
      tabSignUp?.classList.add('text-brand-600', 'border-brand-600');
      tabSignUp?.classList.remove('text-slate-400', 'border-transparent');
      tabSignIn?.classList.remove('text-brand-600', 'border-brand-600');
      tabSignIn?.classList.add('text-slate-400', 'border-transparent');
      nameField?.classList.remove('hidden');
      if (submitBtn) submitBtn.textContent = 'Create Merchant Account';
      if (modalTitle) modalTitle.textContent = 'Join Luvon Q';
    } else {
      tabSignIn?.classList.add('text-brand-600', 'border-brand-600');
      tabSignIn?.classList.remove('text-slate-400', 'border-transparent');
      tabSignUp?.classList.remove('text-brand-600', 'border-brand-600');
      tabSignUp?.classList.add('text-slate-400', 'border-transparent');
      nameField?.classList.add('hidden');
      if (submitBtn) submitBtn.textContent = 'Authenticate Session';
      if (modalTitle) modalTitle.textContent = 'Sign in to Luvon Q';
    }
  }

  async function handleCustomerAuth(e) {
    if (e) e.preventDefault();

    const email = document.getElementById('email')?.value?.trim();
    const password = document.getElementById('password')?.value;
    const fullName = document.getElementById('fullName')?.value?.trim() || 'My Business';
    const submitBtn = document.getElementById('authSubmitBtn');

    if (!email || !password) return;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Authenticating...';
    }

    try {
      const endpoint = currentAuthMode === 'signup' ? '/auth/signup' : '/auth/signin';
      const res = await fetch(`${BASE_URL}/api${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      localStorage.setItem('luvon_active_tenant_id', data.tenantId);
      localStorage.setItem('luvon_business_name', data.businessName || fullName);

      closeSignInModal();
      updateAuthUI(data.user, data.businessName);
      showNotification(`Welcome, ${data.businessName || 'Merchant'}! Session authenticated.`, 'success');

      if (currentAuthMode === 'signup') {
        openOnboardingModal();
      } else {
        setTimeout(() => window.location.reload(), 800);
      }
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = currentAuthMode === 'signup' ? 'Create Merchant Account' : 'Authenticate Session';
      }
    }
  }

  function checkAuthSession() {
    const activeTenant = localStorage.getItem('luvon_active_tenant_id');
    const businessName = localStorage.getItem('luvon_business_name');
    if (activeTenant) {
      updateAuthUI({ id: activeTenant }, businessName || 'Merchant Store');
    } else {
      updateAuthUI(null);
    }
  }

  function toggleSignOut() {
    localStorage.removeItem('luvon_active_tenant_id');
    localStorage.removeItem('luvon_business_name');
    updateAuthUI(null);
    showNotification('Signed out successfully.', 'info');
    setTimeout(() => window.location.reload(), 600);
  }

  function updateAuthUI(user, businessName) {
    const signInBtn = document.getElementById('portalSignInBtn');
    const tenantCard = document.getElementById('activeTenantCard');
    const tenantNameEl = document.getElementById('tenantName');

    if (user) {
      if (signInBtn) signInBtn.classList.add('hidden');
      if (tenantCard) tenantCard.classList.remove('hidden');
      if (tenantNameEl) tenantNameEl.textContent = businessName || 'My Business';
    } else {
      if (signInBtn) signInBtn.classList.remove('hidden');
      if (tenantCard) tenantCard.classList.add('hidden');
    }
    if (window.lucide && typeof window.lucide.createIcons === 'function') lucide.createIcons();
  }

  function openOnboardingModal() {
    const modal = document.getElementById('aiOnboardingModal');
    if (modal) {
      modal.classList.remove('hidden');
      if (window.lucide && typeof window.lucide.createIcons === 'function') lucide.createIcons();
    }
  }

  function closeOnboardingModal() {
    const modal = document.getElementById('aiOnboardingModal');
    if (modal) modal.classList.add('hidden');
  }

  async function runAIBusinessSetup(promptText) {
    if (!promptText || !promptText.trim()) return;

    try {
      const res = await fetch(`${BASE_URL}/api/tenant/ai-onboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getActiveTenantId()
        },
        body: JSON.stringify({ prompt: promptText })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI store configuration failed');

      localStorage.setItem('luvon_business_name', data.businessName);
      showNotification(`✨ Store Generated! Business: ${data.businessName} with ${data.catalog?.length || 0} catalog items.`, 'success');
      
      closeOnboardingModal();
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      showNotification(`AI Setup Notice: ${err.message}`, 'error');
      throw err;
    }
  }

  window.API = {
    getTenantId: getActiveTenantId,
    runAIBusinessSetup,
    openOnboardingModal,
    closeOnboardingModal,
    showToast: showNotification,
    getInventory: () => apiCall('/inventory'),
    saveInventoryItem: (item) => apiCall('/inventory', { method: 'POST', body: JSON.stringify(item) }),
    getMetrics: () => apiCall('/metrics'),
    getConversations: () => apiCall('/conversations')
  };

  window.openSignInModal = openSignInModal;
  window.closeSignInModal = closeSignInModal;
  window.switchAuthTab = switchAuthTab;
  window.handleCustomerAuth = handleCustomerAuth;
  window.toggleSignOut = toggleSignOut;
  window.runAIBusinessSetup = runAIBusinessSetup;
  window.openOnboardingModal = openOnboardingModal;
  window.closeOnboardingModal = closeOnboardingModal;

  document.addEventListener('DOMContentLoaded', checkAuthSession);
})();