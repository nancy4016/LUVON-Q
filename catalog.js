// ==========================================
// 1. STATE & API HELPER
// ==========================================
let catalogItems = [];

async function fetchTenantCatalog() {
  try {
    const data = typeof apiCall === 'function'
      ? await apiCall('/inventory')
      : await (await fetch('http://localhost:3000/api/tenant/inventory', {
          headers: { 'x-tenant-id': 'luvon_q_flagship' }
        })).json();

    catalogItems = Array.isArray(data) ? data : [];
    renderCatalog(catalogItems);
  } catch (err) {
    console.error('❌ Failed to load catalog from server:', err.message);
  }
}

// ==========================================
// 2. DOM RENDERING
// ==========================================
function renderCatalog(items) {
  const tbody = document.getElementById("catalog-table-body");
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="p-6 text-center text-slate-400 font-medium">
          No inventory items found. Click "+ Add Product" to create one.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = items.map(item => `
    <tr class="hover:bg-brand-50/50 transition-colors border-b border-slate-100">
      <td class="p-4 flex items-center gap-3">
        <img 
          src="${item.imageUrl || 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=100&q=80'}" 
          class="w-10 h-10 rounded-lg object-cover border border-brand-200" 
          onerror="this.src='https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=100&q=80'"
        />
        <div>
          <span class="font-bold text-brand-900 text-xs block">${item.name}</span>
          <span class="text-[10px] text-slate-400">ID: ${item.id}</span>
        </div>
      </td>
      <td class="p-4 font-medium text-slate-600">${item.category || 'General'}</td>
      <td class="p-4 font-bold text-brand-900">KSh ${Number(item.price).toLocaleString()}</td>
      <td class="p-4 font-medium">${item.stock} units</td>
      <td class="p-4">
        ${item.stock > 0 
          ? `<span class="px-2.5 py-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 rounded-full">Active for Sale</span>`
          : `<span class="px-2.5 py-1 text-[10px] font-bold text-rose-800 bg-rose-100 rounded-full">Blocked by AI</span>`
        }
      </td>
      <td class="p-4 text-right">
        <button onclick="deleteProductLocal('${item.id}')" class="text-rose-600 hover:underline font-semibold text-xs">Delete</button>
      </td>
    </tr>
  `).join('');
}

function deleteProductLocal(id) {
  catalogItems = catalogItems.filter(item => String(item.id) !== String(id));
  renderCatalog(catalogItems);
}

// ==========================================
// 3. EVENT LISTENERS & MODAL MANAGEMENT
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();
  
  // Initial live fetch
  fetchTenantCatalog();

  // Modal Handlers
  const modal = document.getElementById("product-modal");
  const openBtn = document.getElementById("open-modal-btn");
  const closeBtn = document.getElementById("close-modal-btn");
  const cancelBtn = document.getElementById("cancel-modal-btn");
  const form = document.getElementById("product-form");

  const toggleModal = (show) => {
    if (show) modal?.classList.remove("hidden");
    else modal?.classList.add("hidden");
  };

  openBtn?.addEventListener("click", () => toggleModal(true));
  closeBtn?.addEventListener("click", () => toggleModal(false));
  cancelBtn?.addEventListener("click", () => toggleModal(false));

  // Form Submit (POST to backend)
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("prod-name").value;
    const price = Number(document.getElementById("prod-price").value);
    const stock = Number(document.getElementById("prod-stock").value);
    const category = document.getElementById("prod-category").value;
    const imageUrl = document.getElementById("prod-image")?.value || null;

    const payload = {
      name,
      price,
      stock,
      category,
      hasImage: Boolean(imageUrl),
      imageUrl,
      tags: [category.toLowerCase(), name.toLowerCase()]
    };

    try {
      if (typeof apiCall === 'function') {
        await apiCall('/inventory', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      } else {
        await fetch('http://localhost:3000/api/tenant/inventory', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': 'luvon_q_flagship'
          },
          body: JSON.stringify(payload)
        });
      }

      form.reset();
      toggleModal(false);
      await fetchTenantCatalog(); // Refresh list from server
    } catch (err) {
      alert('Failed to save product to backend: ' + err.message);
    }
  });

  // Search Filter Handler
  document.getElementById("catalog-search")?.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase().trim();
    const filtered = catalogItems.filter(i => 
      i.name.toLowerCase().includes(term) || 
      (i.category && i.category.toLowerCase().includes(term))
    );
    renderCatalog(filtered);
  });

  // Category Filter Handler
  document.getElementById("category-filter")?.addEventListener("change", (e) => {
    const cat = e.target.value;
    if (cat === "ALL" || !cat) {
      renderCatalog(catalogItems);
    } else {
      renderCatalog(catalogItems.filter(i => i.category?.toLowerCase() === cat.toLowerCase()));
    }
  });
});