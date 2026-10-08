// api.js - Luvon Q Production Client Bridge
(function () {
  // Production Host
  const BASE_URL = (typeof window !== 'undefined' && window.location.origin && window.location.origin.includes('http') && !window.location.origin.includes('localhost'))
    ? window.location.origin
    : 'https://luvon-engine.onrender.com';

  let currentTenantId = localStorage.getItem('luvon_active_tenant_id') || null;

  async function apiCall(endpoint, options = {}) {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${BASE_URL}/api/tenant${cleanEndpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      'x-tenant-id': currentTenantId || 'anonymous',
      ...(options.headers || {})
    };

    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data?.message || data?.error || `Request failed (${res.status})`);
    }
    return data;
  }

  // ==========================================
  // AUTHENTICATION MODAL & BACKEND PROXY
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

      currentTenantId = data.tenantId;
      localStorage.setItem('luvon_active_tenant_id', currentTenantId);

      closeSignInModal();
      updateAuthUI(data.user, data.businessName);

      if (currentAuthMode === 'signup') {
        openOnboardingModal();
      } else {
        window.location.reload();
      }
    } catch (err) {
      alert('Authentication Failed: ' + err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = currentAuthMode === 'signup' ? 'Create Merchant Account' : 'Authenticate Session';
      }
    }
  }

  function checkAuthSession() {
    const activeTenant = localStorage.getItem('luvon_active_tenant_id');
    if (activeTenant) {
      updateAuthUI({ id: activeTenant }, localStorage.getItem('luvon_business_name') || 'Merchant Store');
    } else {
      updateAuthUI(null);
    }
  }

  function toggleSignOut() {
    localStorage.removeItem('luvon_active_tenant_id');
    localStorage.removeItem('luvon_business_name');
    currentTenantId = null;
    updateAuthUI(null);
    window.location.reload();
  }

  function updateAuthUI(user, businessName) {
    const signInBtn = document.getElementById('portalSignInBtn');
    const tenantCard = document.getElementById('activeTenantCard');
    const tenantNameEl = document.getElementById('tenantName');

    if (user) {
      if (signInBtn) signInBtn.classList.add('hidden');
      if (tenantCard) tenantCard.classList.remove('hidden');
      if (tenantNameEl) tenantNameEl.textContent = businessName || 'My Business';
      if (businessName) localStorage.setItem('luvon_business_name', businessName);
    } else {
      if (signInBtn) signInBtn.classList.remove('hidden');
      if (tenantCard) tenantCard.classList.add('hidden');
    }
    if (window.lucide) lucide.createIcons();
  }

  // ==========================================
  // GEMINI AI BUSINESS ONBOARDING / SETUP
  // ==========================================
  function openOnboardingModal() {
    const modal = document.getElementById('aiOnboardingModal');
    if (modal) {
      modal.classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
    }
  }

  function closeOnboardingModal() {
    const modal = document.getElementById('aiOnboardingModal');
    if (modal) modal.classList.add('hidden');
  }

  async function runAIBusinessSetup(promptText) {
    if (!promptText || !promptText.trim()) return;
    if (!currentTenantId) {
      openSignInModal();
      return;
    }

    try {
      const res = await fetch(`${BASE_URL}/api/tenant/ai-onboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenantId
        },
        body: JSON.stringify({ prompt: promptText })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI generation failed');

      alert(`✅ Luvon Q Configured!\nBusiness: ${data.businessName}\nAdded ${data.catalog?.length || 0} items to your catalog.`);
      closeOnboardingModal();
      window.location.reload();
    } catch (err) {
      alert('AI Setup Error: ' + err.message);
    }
  }

  window.API = {
    getTenantId: () => currentTenantId,
    runAIBusinessSetup,
    openOnboardingModal,
    closeOnboardingModal,
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

  document.addEventListener('DOMContentLoaded', () => {
    checkAuthSession();
  });
})();