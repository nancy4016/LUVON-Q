// ==========================================
// 1. CAROUSEL SLIDES & INTERACTION
// ==========================================
const slides = [
  {
    image: "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=800&q=80",
    tag: "Sneakers & Streetwear",
    title: "Nairobi Kicks Studio",
    desc: "Autonomous WhatsApp STK Push checkout integration."
  },
  {
    image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=80",
    tag: "Luxury Salon & Spa",
    title: "Orélune Hair & Wellness",
    desc: "Neural ElevenLabs voice replies for consultation bookings."
  },
  {
    image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=80",
    tag: "Boutique & Retail",
    title: "Verve Fashion House",
    desc: "Omnichannel Instagram Direct & WhatsApp memory sync."
  }
];

let currentSlideIndex = 0;

function updateCarousel(index) {
  const slide = slides[index];
  const imgEl = document.getElementById("carousel-img");
  const tagEl = document.getElementById("carousel-tag");
  const titleEl = document.getElementById("carousel-title");
  const descEl = document.getElementById("carousel-desc");
  const dotsContainer = document.getElementById("carousel-dots");

  if (!imgEl) return;

  imgEl.classList.add("opacity-40");
  setTimeout(() => {
    imgEl.src = slide.image;
    if (tagEl) tagEl.textContent = slide.tag;
    if (titleEl) titleEl.textContent = slide.title;
    if (descEl) descEl.textContent = slide.desc;
    imgEl.classList.remove("opacity-40");
  }, 150);

  if (dotsContainer) {
    dotsContainer.innerHTML = slides.map((_, i) => `
      <button onclick="updateCarousel(${i})" class="${i === index ? 'w-6 bg-brand-500' : 'w-2 bg-white/20'} h-1.5 rounded-full transition-all duration-300"></button>
    `).join('');
  }

  currentSlideIndex = index;
}

// ==========================================
// 2. LIVE BACKEND DATA INTEGRATION
// ==========================================
async function loadLiveDashboardData() {
  // 1. Fetch KPI Metrics
  try {
    const metrics = typeof apiCall === 'function' 
      ? await apiCall('/metrics') 
      : await (await fetch('/api/tenant/metrics', {
          headers: { 'x-tenant-id': 'luvon_q_flagship' }
        })).json();

    const revEl = document.getElementById('totalRevenue') || document.querySelector('[data-metric="revenue"]');
    const closedEl = document.getElementById('dealsClosed') || document.querySelector('[data-metric="deals"]');
    const chatsEl = document.getElementById('activeCustomers') || document.querySelector('[data-metric="active"]');
    const itemsEl = document.getElementById('totalCatalogItems') || document.querySelector('[data-metric="items"]');

    if (revEl) revEl.textContent = `KSh ${Number(metrics.totalRevenue || 0).toLocaleString()}`;
    if (closedEl) closedEl.textContent = metrics.dealsClosed || 0;
    if (chatsEl) chatsEl.textContent = metrics.activeCustomers || 0;
    if (itemsEl) itemsEl.textContent = metrics.catalogItems || 0;
  } catch (err) {
    console.warn('⚠️ Could not load live metrics from backend:', err.message);
  }

  // 2. Fetch Live Inventory Catalog
  try {
    const inventory = typeof apiCall === 'function'
      ? await apiCall('/inventory')
      : await (await fetch('/api/tenant/inventory', {
          headers: { 'x-tenant-id': 'luvon_q_flagship' }
        })).json();

    renderInventoryTable(inventory);
  } catch (err) {
    console.warn('⚠️ Could not load live inventory from backend:', err.message);
  }
}

function renderInventoryTable(items) {
  const tableBody = document.getElementById("inventory-table-body");
  if (!tableBody || !Array.isArray(items)) return;

  if (items.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="p-4 text-center text-slate-400">No catalog items found. Add items via the Catalog tab.</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = items.map(item => `
    <tr class="hover:bg-brand-50/50 transition-colors border-b border-slate-100">
      <td class="p-4 font-semibold text-brand-900">${item.name}</td>
      <td class="p-4 text-slate-600">${item.category || 'General'}</td>
      <td class="p-4 font-medium text-slate-900">KSh ${Number(item.price).toLocaleString()}</td>
      <td class="p-4 text-slate-600">${item.stock} in stock</td>
      <td class="p-4">
        ${item.stock > 0 
          ? `<span class="px-2 py-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 rounded-full">In Stock</span>`
          : `<span class="px-2 py-1 text-[10px] font-bold text-rose-700 bg-rose-100 rounded-full">Out of Stock</span>`
        }
      </td>
      <td class="p-4 text-right">
        <a href="catalog.html" class="text-brand-600 hover:underline font-medium">Manage</a>
      </td>
    </tr>
  `).join('');
}

// ==========================================
// 3. AUTHENTICATION & SESSION HANDLING
// ==========================================
let authMode = 'signin';

function openSignInModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.remove('hidden');
}

function closeSignInModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.add('hidden');
}

function switchAuthTab(mode) {
  authMode = mode;
  const tabSignIn = document.getElementById('tabSignIn');
  const tabSignUp = document.getElementById('tabSignUp');
  const nameField = document.getElementById('nameFieldGroup');
  const signInOptions = document.getElementById('signInOptions');
  const title = document.getElementById('authModalTitle');
  const submitBtn = document.getElementById('authSubmitBtn');

  if (mode === 'signup') {
    if (tabSignUp) tabSignUp.className = "flex-1 py-2 text-center text-brand-600 border-b-2 border-brand-600 transition-all font-semibold";
    if (tabSignIn) tabSignIn.className = "flex-1 py-2 text-center text-slate-400 hover:text-slate-600 border-b-2 border-transparent transition-all";
    if (nameField) nameField.classList.remove('hidden');
    if (signInOptions) signInOptions.classList.add('hidden');
    if (title) title.textContent = "Create an Account";
    if (submitBtn) submitBtn.textContent = "Register & Connect Portal";
  } else {
    if (tabSignIn) tabSignIn.className = "flex-1 py-2 text-center text-brand-600 border-b-2 border-brand-600 transition-all font-semibold";
    if (tabSignUp) tabSignUp.className = "flex-1 py-2 text-center text-slate-400 hover:text-slate-600 border-b-2 border-transparent transition-all";
    if (nameField) nameField.classList.add('hidden');
    if (signInOptions) signInOptions.classList.remove('hidden');
    if (title) title.textContent = "Sign in to Orélune OS";
    if (submitBtn) submitBtn.textContent = "Authenticate Session";
  }
}

function handleCustomerAuth(event) {
  if (event) event.preventDefault();
  const emailInput = document.getElementById('email');
  const nameInput = document.getElementById('fullName');
  const email = emailInput ? emailInput.value : '';
  const fullName = nameInput && nameInput.value ? nameInput.value : 'Nairobi Kicks Studio';

  localStorage.setItem('luvon_authenticated', 'true');
  localStorage.setItem('luvon_user_email', email);
  localStorage.setItem('luvon_tenant_name', fullName);

  const tenantNameEl = document.getElementById('tenantName');
  if (tenantNameEl) tenantNameEl.textContent = fullName;

  updateAuthUI(true);
  closeSignInModal();
}

function toggleSignOut() {
  localStorage.removeItem('luvon_authenticated');
  localStorage.removeItem('luvon_user_email');
  localStorage.removeItem('luvon_tenant_name');
  updateAuthUI(false);
}

function updateAuthUI(isAuthenticated) {
  const signInBtn = document.getElementById('portalSignInBtn');
  const tenantCard = document.getElementById('activeTenantCard');

  if (isAuthenticated) {
    if (signInBtn) signInBtn.classList.add('hidden');
    if (tenantCard) tenantCard.classList.remove('hidden');
    const savedName = localStorage.getItem('luvon_tenant_name');
    const tenantNameEl = document.getElementById('tenantName');
    if (savedName && tenantNameEl) tenantNameEl.textContent = savedName;
  } else {
    if (signInBtn) signInBtn.classList.remove('hidden');
    if (tenantCard) tenantCard.classList.add('hidden');
  }
}

// ==========================================
// 4. NAVIGATION & MOBILE DRAWER HANDLERS
// ==========================================
function toggleMobileMenu() {
  const sidebar = document.getElementById('sidebarNav');
  const backdrop = document.getElementById('sidebarBackdrop');

  if (sidebar) sidebar.classList.toggle('-translate-x-full');
  if (backdrop) backdrop.classList.toggle('hidden');
}

function highlightActiveRoute() {
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const navLinks = document.querySelectorAll('.nav-link');

  navLinks.forEach(link => {
    const linkPath = link.getAttribute('href');
    link.classList.remove('bg-brand-100', 'text-brand-900', 'font-semibold', 'active');
    link.classList.add('text-slate-600');

    if (linkPath === currentPath) {
      link.classList.add('bg-brand-100', 'text-brand-900', 'font-semibold', 'active');
      link.classList.remove('text-slate-600');
    }
  });
}

// ==========================================
// 5. GLOBAL INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();

  highlightActiveRoute();
  updateCarousel(0);
  loadLiveDashboardData();

  const isLoggedIn = localStorage.getItem('luvon_authenticated') === 'true';
  updateAuthUI(isLoggedIn);

  // Carousel timer
  setInterval(() => {
    const nextIndex = (currentSlideIndex + 1) % slides.length;
    updateCarousel(nextIndex);
  }, 5000);

  // Manual Carousel Buttons
  document.getElementById("prev-slide")?.addEventListener("click", () => {
    const prevIndex = (currentSlideIndex - 1 + slides.length) % slides.length;
    updateCarousel(prevIndex);
  });

  document.getElementById("next-slide")?.addEventListener("click", () => {
    const nextIndex = (currentSlideIndex + 1) % slides.length;
    updateCarousel(nextIndex);
  });
});