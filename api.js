// api.js - Luvon Q Production Client Bridge & Dual-Account Vault System
(function () {
  const BASE_URL = (typeof window !== 'undefined' && window.location.origin && window.location.origin.includes('http') && !window.location.origin.includes('localhost'))
    ? window.location.origin
    : '';

  let SUPABASE_URL = '';
  let SUPABASE_ANON_KEY = '';

  // Asynchronously fetch public connection parameters from server environment (Zero Hardcoded Keys)
  async function loadPublicConfig() {
    try {
      const res = await fetch(`${BASE_URL}/api/config/public`);
      if (res.ok) {
        const data = await res.json();
        SUPABASE_URL = data.supabaseUrl || '';
        SUPABASE_ANON_KEY = data.supabaseAnonKey || '';
      }
    } catch (e) {
      console.warn('Could not retrieve public authentication config');
    }
  }

  function isAuthenticated() {
    const user = localStorage.getItem('luvon_user');
    const tenantId = localStorage.getItem('luvon_active_tenant_id') || localStorage.getItem('luvon_tenant_id');
    return Boolean(user && tenantId && tenantId !== 'anonymous');
  }

  // ========================================================
  // STRICT ROUTE AUTHENTICATION GATE (CLIENT LAYER)
  // ========================================================
  const currentPath = window.location.pathname.toLowerCase();
  const isLandingPage = currentPath === '/' || currentPath.endsWith('index.html') || currentPath === '';
  
  if (!isLandingPage && !isAuthenticated()) {
    if (document.documentElement) {
      document.documentElement.style.display = 'none';
    }
    sessionStorage.setItem('luvon_auth_redirect_reason', 'Please sign in to access your store portal.');
    window.location.replace('/index.html?auth=required');
  }

  function getActiveTenantId() {
    return localStorage.getItem('luvon_active_tenant_id') || 
           localStorage.getItem('luvon_tenant_id') || 
           'anonymous';
  }

  function setTenantId(tenantId) {
    if (!tenantId) return;
    localStorage.setItem('luvon_active_tenant_id', tenantId);
    localStorage.setItem('luvon_tenant_id', tenantId);
  }

  // ========================================================
  // DUAL-ACCOUNT VAULT & PERSISTENCE (MAX 2 ACCOUNTS)
  // ========================================================
  function getAccountsVault() {
    try {
      return JSON.parse(localStorage.getItem('luvon_accounts_vault')) || [];
    } catch (e) {
      return [];
    }
  }

  function saveCurrentAccountToVault() {
    const userStr = localStorage.getItem('luvon_user');
    const tenantId = localStorage.getItem('luvon_active_tenant_id');
    if (!userStr || !tenantId || tenantId === 'anonymous') return;

    const user = JSON.parse(userStr);
    const email = localStorage.getItem('luvon_user_email') || user.email || '';
    const businessName = localStorage.getItem('luvon_business_name') || 'Merchant Store';
    const avatarUrl = localStorage.getItem('luvon_user_avatar') || null;
    const accessToken = localStorage.getItem('luvon_access_token') || '';
    const refreshToken = localStorage.getItem('luvon_refresh_token') || '';

    const currentAcc = {
      tenantId,
      email,
      businessName,
      avatarUrl,
      user,
      accessToken,
      refreshToken
    };

    let vault = getAccountsVault();
    vault = vault.filter(acc => acc.email.toLowerCase() !== email.toLowerCase());
    vault.unshift(currentAcc);
    vault = vault.slice(0, 2); // Enforce maximum of 2 accounts
    localStorage.setItem('luvon_accounts_vault', JSON.stringify(vault));
  }

  function switchAccount(targetEmail) {
    saveCurrentAccountToVault();
    const vault = getAccountsVault();
    const currentEmail = (localStorage.getItem('luvon_user_email') || '').toLowerCase();
    
    // Locate the other paired account
    const target = targetEmail 
      ? vault.find(acc => acc.email.toLowerCase() === targetEmail.toLowerCase())
      : vault.find(acc => acc.email.toLowerCase() !== currentEmail);

    if (target && target.accessToken) {
      // Instant seamless switch
      localStorage.setItem('luvon_user', JSON.stringify(target.user));
      localStorage.setItem('luvon_active_tenant_id', target.tenantId);
      localStorage.setItem('luvon_business_name', target.businessName);
      localStorage.setItem('luvon_user_email', target.email);
      localStorage.setItem('luvon_access_token', target.accessToken);
      if (target.avatarUrl) {
        localStorage.setItem('luvon_user_avatar', target.avatarUrl);
      } else {
        localStorage.removeItem('luvon_user_avatar');
      }
      if (target.refreshToken) {
        localStorage.setItem('luvon_refresh_token', target.refreshToken);
      }

      showToast(`Switched account to ${target.businessName || target.email}`, 'success');
      setTimeout(() => window.location.reload(), 200);
    } else {
      // Second account not paired yet -> launch connection flow for 2nd account
      if (vault.length >= 2) {
        showToast('Maximum 2 accounts connected. Please remove an account in Settings first.', 'warning');
        return;
      }
      sessionStorage.setItem('luvon_adding_secondary_account', 'true');
      showToast('Connect your second account (Max 2 accounts).', 'info');
      openSignInModal();
    }
  }

  function unlinkAccount(targetEmail) {
    let vault = getAccountsVault();
    vault = vault.filter(acc => acc.email.toLowerCase() !== targetEmail.toLowerCase());
    localStorage.setItem('luvon_accounts_vault', JSON.stringify(vault));
    showToast('Account unlinked from quick switch.', 'info');
    setTimeout(() => window.location.reload(), 200);
  }

  function toggleSignOut() {
    const currentEmail = (localStorage.getItem('luvon_user_email') || '').toLowerCase();
    let vault = getAccountsVault();
    vault = vault.filter(acc => acc.email.toLowerCase() !== currentEmail);
    localStorage.setItem('luvon_accounts_vault', JSON.stringify(vault));

    localStorage.removeItem('luvon_user');
    localStorage.removeItem('luvon_active_tenant_id');
    localStorage.removeItem('luvon_business_name');
    localStorage.removeItem('luvon_user_email');
    localStorage.removeItem('luvon_user_avatar');
    localStorage.removeItem('luvon_access_token');
    localStorage.removeItem('luvon_refresh_token');

    updateAuthUI(null);
    showToast('Signed out successfully.', 'info');
    setTimeout(() => {
      window.location.replace('/index.html');
    }, 300);
  }

  // ========================================================
  // LUVON LUXURY NOTIFICATION (TOAST) ENGINE
  // ========================================================
  function initToastContainer() {
    let container = document.getElementById('luvon-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'luvon-toast-container';
      container.className = 'fixed bottom-6 right-6 z-[99999] flex flex-col gap-3 pointer-events-none max-w-sm w-full px-4';
      document.body.appendChild(container);
    }
    return container;
  }

  function showToast(message, type = 'info') {
    const container = initToastContainer();
    const toast = document.createElement('div');

    let borderStyle = 'border-brand-500/40';
    let bgStyle = 'bg-[#1c1917]/95 text-white';
    let iconSvg = '<i data-lucide="info" class="w-4 h-4 text-brand-400"></i>';

    if (type === 'success') {
      borderStyle = 'border-emerald-500/50';
      iconSvg = '<i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-400"></i>';
    } else if (type === 'error') {
      borderStyle = 'border-rose-500/50';
      iconSvg = '<i data-lucide="alert-circle" class="w-4 h-4 text-rose-400"></i>';
    } else if (type === 'warning') {
      borderStyle = 'border-amber-500/50';
      iconSvg = '<i data-lucide="alert-triangle" class="w-4 h-4 text-amber-400"></i>';
    }

    toast.className = `pointer-events-auto transform transition-all duration-300 ease-out translate-y-4 opacity-0 flex items-center gap-3 p-4 rounded-2xl shadow-2xl backdrop-blur-md border ${borderStyle} ${bgStyle} font-sans text-xs`;
    toast.innerHTML = `
      <div class="flex-shrink-0 flex items-center justify-center">${iconSvg}</div>
      <div class="flex-1 font-medium leading-relaxed">${message}</div>
      <button type="button" class="text-white/40 hover:text-white p-1 transition-colors cursor-pointer" onclick="this.parentElement.remove()">
        <i data-lucide="x" class="w-3.5 h-3.5"></i>
      </button>
    `;

    container.appendChild(toast);
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      lucide.createIcons({ root: toast });
    }

    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-4', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 4200);
  }

  // ========================================================
  // LUVON LUXURY CONFIRMATION MODAL
  // ========================================================
  function showConfirmModal({ title = "Are you sure?", message, confirmText = "Confirm", isDanger = false }) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-[999999] bg-stone-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200';
      
      const btnColor = isDanger 
        ? 'bg-rose-600 hover:bg-rose-700 text-white' 
        : 'bg-brand-600 hover:bg-brand-500 text-white';

      modal.innerHTML = `
        <div class="bg-white rounded-2xl border border-brand-200/80 shadow-2xl max-w-sm w-full p-6 space-y-4 transform transition-all">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl ${isDanger ? 'bg-rose-100 text-rose-700' : 'bg-brand-100 text-brand-700'} flex items-center justify-center flex-shrink-0">
              <i data-lucide="${isDanger ? 'alert-triangle' : 'help-circle'}" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="font-serif font-bold text-base text-brand-900">${title}</h3>
              <p class="text-xs text-slate-500 mt-0.5">${message || 'Please confirm to proceed with this operation.'}</p>
            </div>
          </div>
          <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button id="modal-cancel-btn" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer">
              Cancel
            </button>
            <button id="modal-confirm-btn" class="px-5 py-2 text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer ${btnColor}">
              ${confirmText}
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        lucide.createIcons({ root: modal });
      }

      modal.querySelector('#modal-cancel-btn').onclick = () => {
        modal.remove();
        resolve(false);
      };
      modal.querySelector('#modal-confirm-btn').onclick = () => {
        modal.remove();
        resolve(true);
      };
    });
  }

  // ========================================================
  // LUVON LUXURY INPUT PROMPT MODAL
  // ========================================================
  function showPromptModal({ title, subtitle, placeholder = "Type here...", confirmText = "Submit", isDanger = false }) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-[999999] bg-stone-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200';

      const btnColor = isDanger 
        ? 'bg-rose-600 hover:bg-rose-700 text-white' 
        : 'bg-brand-600 hover:bg-brand-500 text-white';

      modal.innerHTML = `
        <div class="bg-white rounded-2xl border border-brand-200/80 shadow-2xl max-w-sm w-full p-6 space-y-4">
          <div class="space-y-1">
            <h3 class="font-serif font-bold text-base text-brand-900">${title}</h3>
            ${subtitle ? `<p class="text-xs text-slate-500">${subtitle}</p>` : ''}
          </div>
          <input 
            type="text" 
            id="prompt-input-value" 
            placeholder="${placeholder}" 
            class="w-full px-3.5 py-2.5 bg-brand-50 border border-brand-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-brand-600"
          />
          <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button id="prompt-cancel-btn" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer">
              Cancel
            </button>
            <button id="prompt-confirm-btn" class="px-5 py-2 text-xs font-bold rounded-xl shadow-md cursor-pointer ${btnColor}">
              ${confirmText}
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        lucide.createIcons({ root: modal });
      }

      const input = modal.querySelector('#prompt-input-value');
      input.focus();

      modal.querySelector('#prompt-cancel-btn').onclick = () => {
        modal.remove();
        resolve(null);
      };

      const handleConfirm = () => {
        const val = input.value;
        modal.remove();
        resolve(val);
      };

      modal.querySelector('#prompt-confirm-btn').onclick = handleConfirm;
      input.onkeydown = (e) => {
        if (e.key === 'Enter') handleConfirm();
        if (e.key === 'Escape') { modal.remove(); resolve(null); }
      };
    });
  }

  window.alert = function(msg) {
    showToast(msg, 'info');
  };

  async function apiCall(endpoint, options = {}) {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${BASE_URL}/api/tenant${cleanEndpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      'x-tenant-id': getActiveTenantId(),
      ...(options.headers || {})
    };

    const res = await fetch(url, { ...options, headers });
    const contentType = res.headers.get("content-type");
    if (!res.ok || !contentType || !contentType.includes("application/json")) {
      return [];
    }

    const data = await res.json().catch(() => []);
    return data;
  }

  // ==========================================
  // OAUTH INITIALIZATION (Google / GitHub)
  // ==========================================
  async function initiateOAuth(provider) {
    if (!['google', 'github'].includes(provider)) {
      showToast(`Unsupported login provider: ${provider}`, 'error');
      return;
    }

    if (!SUPABASE_URL) {
      await loadPublicConfig();
    }

    if (!SUPABASE_URL) {
      showToast("Authentication server unavailable. Check server connection.", "error");
      return;
    }

    saveCurrentAccountToVault();

    const homeInput = document.getElementById('homeAiPromptInput');
    if (homeInput && homeInput.value.trim()) {
      sessionStorage.setItem('pending_onboard_prompt', homeInput.value.trim());
    }

    const currentOrigin = window.location.origin;
    const redirectUrl = `${currentOrigin}/index.html`;

    const oauthUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectUrl)}&prompt=select_account`;
    window.location.href = oauthUrl;
  }

  // ==========================================
  // PARSE SUPABASE AUTH HASH ON REDIRECT
  // ==========================================
  async function handleAuthHashRedirect() {
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token=')) return false;

    try {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (!accessToken) return false;

      window.history.replaceState({}, document.title, window.location.pathname);

      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        await loadPublicConfig();
      }

      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!userRes.ok) throw new Error('Could not verify credentials with authentication server.');
      const user = await userRes.json();
      const meta = user.user_metadata || {};

      const businessName = meta.tenant_name || meta.full_name || meta.name || meta.user_name || (user.email ? user.email.split('@')[0] : 'My Store');
      const tenantId = meta.tenant_id || `tenant_${user.id.replace(/-/g, '').slice(0, 10)}`;
      const avatarUrl = meta.avatar_url || meta.picture || null;

      localStorage.setItem('luvon_user', JSON.stringify(user));
      localStorage.setItem('luvon_active_tenant_id', tenantId);
      localStorage.setItem('luvon_business_name', businessName);
      localStorage.setItem('luvon_user_email', user.email || '');
      localStorage.setItem('luvon_access_token', accessToken);
      if (avatarUrl) {
        localStorage.setItem('luvon_user_avatar', avatarUrl);
      } else {
        localStorage.removeItem('luvon_user_avatar');
      }

      if (refreshToken) {
        localStorage.setItem('luvon_refresh_token', refreshToken);
      }

      saveCurrentAccountToVault();
      sessionStorage.removeItem('luvon_adding_secondary_account');

      await fetch(`${BASE_URL}/api/tenant/sync-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId
        },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          businessName: businessName,
          avatarUrl: avatarUrl
        })
      }).catch(() => {});

      updateAuthUI(user, businessName);
      showToast(`Welcome, ${businessName}! Successfully authenticated.`, 'success');

      return true;
    } catch (err) {
      showToast(`Auth Error: ${err.message}`, 'error');
      return false;
    }
  }

  // ==========================================
  // AUTH MODAL HANDLERS
  // ==========================================
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
      saveCurrentAccountToVault();

      const endpoint = currentAuthMode === 'signup' ? '/auth/signup' : '/auth/signin';
      const res = await fetch(`${BASE_URL}/api${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      if (currentAuthMode === 'signup') {
        closeSignInModal();
        showToast(`Confirmation email dispatched to ${email}. Please verify your email before signing in.`, 'info');
        switchAuthTab('signin');
        return;
      }

      localStorage.setItem('luvon_user', JSON.stringify(data.user || { email }));
      localStorage.setItem('luvon_active_tenant_id', data.tenantId);
      localStorage.setItem('luvon_business_name', data.businessName || fullName);
      localStorage.setItem('luvon_user_email', email);

      const avatar = data.user?.user_metadata?.avatar_url || data.user?.user_metadata?.picture;
      if (avatar) {
        localStorage.setItem('luvon_user_avatar', avatar);
      } else {
        localStorage.removeItem('luvon_user_avatar');
      }

      saveCurrentAccountToVault();
      sessionStorage.removeItem('luvon_adding_secondary_account');

      closeSignInModal();
      updateAuthUI(data.user, data.businessName);
      showToast(`Welcome, ${data.businessName || 'Merchant'}!`, 'success');

      setTimeout(() => window.location.reload(), 300);
    } catch (err) {
      showToast(err.message, 'error');
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
    if (isAuthenticated()) {
      saveCurrentAccountToVault();
      updateAuthUI({ id: activeTenant }, businessName || 'Merchant Store');
    } else {
      updateAuthUI(null);
    }
  }

  // ==========================================
  // BORDERLESS AVATAR & SIDEBAR HYDRATION
  // ==========================================
  function updateAuthUI(user, businessName) {
    const signInBtn = document.getElementById('portalSignInBtn');
    const tenantCard = document.getElementById('activeTenantCard');
    const userAvatarCircle = document.getElementById('userAvatarCircle');

    if (user && isAuthenticated()) {
      if (signInBtn) signInBtn.classList.add('hidden');
      if (tenantCard) tenantCard.classList.remove('hidden');

      if (userAvatarCircle) {
        userAvatarCircle.onclick = function() {
          window.location.href = 'settings.html#profile';
        };
        userAvatarCircle.title = "View Account Profile";

        const avatarUrl = localStorage.getItem('luvon_user_avatar');
        const name = businessName || localStorage.getItem('luvon_business_name') || 'Merchant';
        const initial = name.trim().charAt(0).toUpperCase() || 'M';

        if (avatarUrl) {
          userAvatarCircle.className = "w-11 h-11 rounded-full overflow-hidden flex items-center justify-center cursor-pointer transition-transform hover:scale-105 shadow-md bg-stone-900";
          userAvatarCircle.innerHTML = `
            <img src="${avatarUrl}" alt="${name}" class="w-full h-full object-cover rounded-full" />
          `;
        } else {
          userAvatarCircle.className = "w-11 h-11 rounded-full bg-slate-900 text-[#bf862d] flex items-center justify-center font-black text-xl shadow-md cursor-pointer transition-transform hover:scale-105";
          userAvatarCircle.innerHTML = `<span id="userInitial">${initial}</span>`;
        }
      }
    } else {
      if (signInBtn) signInBtn.classList.remove('hidden');
      if (tenantCard) tenantCard.classList.add('hidden');
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      lucide.createIcons();
    }
  }

  window.API = {
    isAuthenticated,
    getTenantId: getActiveTenantId,
    setTenantId,
    getAccountsVault,
    switchAccount,
    unlinkAccount,
    showToast,
    showConfirmModal,
    showPromptModal,
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
  window.switchAccount = switchAccount;
  window.unlinkAccount = unlinkAccount;
  window.initiateOAuth = initiateOAuth;

  document.addEventListener('DOMContentLoaded', async () => {
    await loadPublicConfig();

    const redirected = await handleAuthHashRedirect();
    if (!redirected) {
      checkAuthSession();
    }

    if (isLandingPage) {
      const urlParams = new URLSearchParams(window.location.search);
      const authRequired = urlParams.get('auth');
      const redirectReason = sessionStorage.getItem('luvon_auth_redirect_reason');
      
      if (authRequired === 'required' || redirectReason) {
        sessionStorage.removeItem('luvon_auth_redirect_reason');
        openSignInModal();
        if (redirectReason) {
          showToast(redirectReason, 'warning');
        }
      }
    }
  });
})();