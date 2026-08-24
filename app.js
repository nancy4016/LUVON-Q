// Carousel Slides Data
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

// Update Carousel View
function updateCarousel(index) {
  const slide = slides[index];
  const imgEl = document.getElementById("carousel-img");
  const tagEl = document.getElementById("carousel-tag");
  const titleEl = document.getElementById("carousel-title");
  const descEl = document.getElementById("carousel-desc");
  const dotsContainer = document.getElementById("carousel-dots");

  if (!imgEl) return;

  // Fade transition effect
  imgEl.classList.add("opacity-40");
  setTimeout(() => {
    imgEl.src = slide.image;
    tagEl.textContent = slide.tag;
    titleEl.textContent = slide.title;
    descEl.textContent = slide.desc;
    imgEl.classList.remove("opacity-40");
  }, 150);

  // Render dots
  if (dotsContainer) {
    dotsContainer.innerHTML = slides.map((_, i) => `
      <button onclick="updateCarousel(${i})" class="${i === index ? 'w-6 bg-brand-500' : 'w-2 bg-white/20'} h-1.5 rounded-full transition-all duration-300"></button>
    `).join('');
  }

  currentSlideIndex = index;
}

// Sample Catalog Inventory Data
const catalogData = [
  {
    id: "prod_1",
    name: "Air Force 1 White",
    category: "Sneakers",
    price: 2500,
    stock: 4
  },
  {
    id: "prod_2",
    name: "Jordan 4 Retro Black",
    category: "Sneakers",
    price: 4800,
    stock: 0
  },
  {
    id: "prod_3",
    name: "Luxury Silk Spa Robe",
    category: "Wellness",
    price: 6500,
    stock: 12
  }
];

// Render Table
function renderInventoryTable(items) {
  const tableBody = document.getElementById("inventory-table-body");
  if (!tableBody) return;

  tableBody.innerHTML = items.map(item => `
    <tr class="hover:bg-brand-50/50 transition-colors">
      <td class="p-4 font-semibold text-brand-900">${item.name}</td>
      <td class="p-4">${item.category}</td>
      <td class="p-4 font-medium">KSh ${item.price.toLocaleString()}</td>
      <td class="p-4">${item.stock} pairs</td>
      <td class="p-4">
        ${item.stock > 0 
          ? `<span class="px-2 py-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 rounded-full">In Stock</span>`
          : `<span class="px-2 py-1 text-[10px] font-bold text-rose-700 bg-rose-100 rounded-full">Out of Stock</span>`
        }
      </td>
      <td class="p-4 text-right">
        <button class="text-brand-600 hover:underline font-medium">Edit</button>
      </td>
    </tr>
  `).join('');
}

// Event Setup
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();
  
  renderInventoryTable(catalogData);
  updateCarousel(0);

  // Slide Auto-play every 5 seconds
  setInterval(() => {
    const nextIndex = (currentSlideIndex + 1) % slides.length;
    updateCarousel(nextIndex);
  }, 5000);

  // Slide Manual Controls
  document.getElementById("prev-slide")?.addEventListener("click", () => {
    const prevIndex = (currentSlideIndex - 1 + slides.length) % slides.length;
    updateCarousel(prevIndex);
  });

  document.getElementById("next-slide")?.addEventListener("click", () => {
    const nextIndex = (currentSlideIndex + 1) % slides.length;
    updateCarousel(nextIndex);
  });
});