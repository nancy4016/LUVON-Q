// Catalog state matching Prisma Database schema[cite: 1]
let catalogItems = [
  {
    id: "prod_1",
    name: "Air Force 1 White",
    category: "Sneakers",
    price: 2500,
    stock: 4,
    hasImage: true,
    imageUrl: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=200&q=80"
  },
  {
    id: "prod_2",
    name: "Jordan 4 Retro Black",
    category: "Sneakers",
    price: 4800,
    stock: 0,
    hasImage: true,
    imageUrl: "https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?auto=format&fit=crop&w=200&q=80"
  },
  {
    id: "prod_3",
    name: "Luxury Silk Spa Robe",
    category: "Wellness",
    price: 6500,
    stock: 12,
    hasImage: true,
    imageUrl: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=200&q=80"
  }
];

function renderCatalog(items) {
  const tbody = document.getElementById("catalog-table-body");
  if (!tbody) return;

  tbody.innerHTML = items.map(item => `
    <tr class="hover:bg-brand-50/50 transition-colors">
      <td class="p-4 flex items-center gap-3">
        <img src="${item.imageUrl || 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=100&q=80'}" class="w-10 h-10 rounded-lg object-cover border border-brand-200" />
        <div>
          <span class="font-bold text-brand-900 text-xs block">${item.name}</span>
          <span class="text-[10px] text-slate-400">ID: ${item.id}</span>
        </div>
      </td>
      <td class="p-4 font-medium text-slate-600">${item.category}</td>
      <td class="p-4 font-bold text-brand-900">KSh ${item.price.toLocaleString()}</td>
      <td class="p-4 font-medium">${item.stock} units</td>
      <td class="p-4">
        ${item.stock > 0 
          ? `<span class="px-2.5 py-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 rounded-full">Active for Sale</span>`
          : `<span class="px-2.5 py-1 text-[10px] font-bold text-rose-800 bg-rose-100 rounded-full">Blocked by AI</span>`
        }
      </td>
      <td class="p-4 text-right">
        <button onclick="deleteProduct('${item.id}')" class="text-rose-600 hover:underline font-semibold text-xs">Delete</button>
      </td>
    </tr>
  `).join('');
}

function deleteProduct(id) {
  catalogItems = catalogItems.filter(item => item.id !== id);
  renderCatalog(catalogItems);
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();
  
  renderCatalog(catalogItems);

  // Modal Handlers
  const modal = document.getElementById("product-modal");
  const openBtn = document.getElementById("open-modal-btn");
  const closeBtn = document.getElementById("close-modal-btn");
  const cancelBtn = document.getElementById("cancel-modal-btn");
  const form = document.getElementById("product-form");

  const toggleModal = (show) => {
    if (show) modal.classList.remove("hidden");
    else modal.classList.add("hidden");
  };

  openBtn?.addEventListener("click", () => toggleModal(true));
  closeBtn?.addEventListener("click", () => toggleModal(false));
  cancelBtn?.addEventListener("click", () => toggleModal(false));

  // Form Submit Handler
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const newItem = {
      id: `prod_${Date.now()}`,
      name: document.getElementById("prod-name").value,
      price: Number(document.getElementById("prod-price").value),
      stock: Number(document.getElementById("prod-stock").value),
      category: document.getElementById("prod-category").value,
      hasImage: true,
      imageUrl: document.getElementById("prod-image").value || null
    };

    catalogItems.unshift(newItem);
    renderCatalog(catalogItems);
    form.reset();
    toggleModal(false);
  });

  // Search Filter Handler
  document.getElementById("catalog-search")?.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = catalogItems.filter(i => i.name.toLowerCase().includes(term) || i.category.toLowerCase().includes(term));
    renderCatalog(filtered);
  });

  // Category Filter Handler
  document.getElementById("category-filter")?.addEventListener("change", (e) => {
    const cat = e.target.value;
    if (cat === "ALL") renderCatalog(catalogItems);
    else renderCatalog(catalogItems.filter(i => i.category === cat));
  });
});