document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();

  let selectedType = "BUY_GOODS";

  const btnBuyGoods = document.getElementById("type-buygoods");
  const btnPaybill = document.getElementById("type-paybill");

  // Account Type Toggle Handlers
  if (btnBuyGoods && btnPaybill) {
    btnBuyGoods.addEventListener("click", () => {
      selectedType = "BUY_GOODS";
      btnBuyGoods.className = "p-3.5 rounded-xl border-2 border-brand-600 bg-brand-50/50 text-xs font-bold text-brand-900 flex items-center justify-center gap-2 transition-all";
      btnPaybill.className = "p-3.5 rounded-xl border border-brand-200 bg-white hover:border-brand-500 text-xs font-bold text-slate-600 flex items-center justify-center gap-2 transition-all";
    });

    btnPaybill.addEventListener("click", () => {
      selectedType = "PAYBILL";
      btnPaybill.className = "p-3.5 rounded-xl border-2 border-brand-600 bg-brand-50/50 text-xs font-bold text-brand-900 flex items-center justify-center gap-2 transition-all";
      btnBuyGoods.className = "p-3.5 rounded-xl border border-brand-200 bg-white hover:border-brand-500 text-xs font-bold text-slate-600 flex items-center justify-center gap-2 transition-all";
    });
  }

  // Trigger STK Push Test Handler
  const stkBtn = document.getElementById("trigger-stk-btn");
  const statusBox = document.getElementById("stk-status-box");
  const statusBadge = document.getElementById("stk-status-badge");
  const statusText = document.getElementById("stk-status-text");

  if (stkBtn) {
    stkBtn.addEventListener("click", () => {
      const testPhone = document.getElementById("test-phone").value;
      if (!testPhone) {
        alert("Please enter a phone number for the test prompt.");
        return;
      }

      stkBtn.classList.add("opacity-60");
      stkBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Sending STK Push...`;
      if (window.lucide) lucide.createIcons();

      statusBox.classList.remove("hidden");
      statusBadge.className = "text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800";
      statusBadge.textContent = "PENDING";
      statusText.textContent = `Sending KSh 1 STK prompt to ${testPhone}... Check your handset.`;

      setTimeout(() => {
        stkBtn.classList.remove("opacity-60");
        stkBtn.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i> Trigger Test STK Push`;
        if (window.lucide) lucide.createIcons();

        statusBadge.className = "text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800";
        statusBadge.textContent = "SUCCESS (200 OK)";
        statusText.textContent = `[MerchantRequestID: 29182-938192-1]\nResponse: STK Push sent successfully to handset ${testPhone}.`;
      }, 2000);
    });
  }

  // Save Credentials Handler
  const saveBtn = document.getElementById("save-daraja-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const shortcode = document.getElementById("daraja-shortcode").value;
      alert(`Daraja Credentials Saved!\nType: ${selectedType}\nShortcode: ${shortcode}`);
    });
  }
});