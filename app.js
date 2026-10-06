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
const APP_BASE_ORIGIN = (typeof window !== 'undefined' && window.location.origin && window.location.origin.includes('http'))
  ? window.location.origin
  : 'http://localhost:3000';
const APP_TENANT_ID = 'luvon_q_flagship';

async function loadLiveDashboardData() {
  // 1. Fetch KPI Metrics
  try {
    const metrics = (typeof window.API !== 'undefined' && typeof window.API.getMetrics === 'function')
      ? await window.API.getMetrics()
      : (typeof apiCall === 'function')
        ? await apiCall('/metrics')
        : await (await fetch(`${APP_BASE_ORIGIN}/api/tenant/metrics`, {
            headers: { 'x-tenant-id': APP_TENANT_ID }
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
    const inventory = (typeof window.API !== 'undefined' && typeof window.API.getInventory === 'function')
      ? await window.API.getInventory()
      : (typeof apiCall === 'function')
        ? await apiCall('/inventory')
        : await (await fetch(`${APP_BASE_ORIGIN}/api/tenant/inventory`, {
            headers: { 'x-tenant-id': APP_TENANT_ID }
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

  if (window.lucide) {
    lucide.createIcons();
  }
}

// ==========================================
// 3. NAVIGATION & MOBILE DRAWER HANDLERS
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
// 4. GLOBAL INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();

  highlightActiveRoute();
  updateCarousel(0);
  loadLiveDashboardData();

  // Carousel auto-advance
  setInterval(() => {
    const nextIndex = (currentSlideIndex + 1) % slides.length;
    updateCarousel(nextIndex);
  }, 5000);

  // Manual Carousel Controls
  document.getElementById("prev-slide")?.addEventListener("click", () => {
    const prevIndex = (currentSlideIndex - 1 + slides.length) % slides.length;
    updateCarousel(prevIndex);
  });

  document.getElementById("next-slide")?.addEventListener("click", () => {
    const nextIndex = (currentSlideIndex + 1) % slides.length;
    updateCarousel(nextIndex);
  });

  setTimeout(() => {
    if (window.lucide) lucide.createIcons();
  }, 400);
});