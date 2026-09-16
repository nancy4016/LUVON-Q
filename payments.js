document.addEventListener("DOMContentLoaded", async () => {
  if (window.lucide) lucide.createIcons();

  // Dynamic origin resolution matching local and Render environments
  const BASE_ORIGIN = (typeof window !== 'undefined' && window.location.origin && window.location.origin.includes('http'))
    ? window.location.origin
    : 'http://localhost:3000';
  const API_BASE = `${BASE_ORIGIN}/api/tenant`;
  const TENANT_ID = 'luvon_q_flagship';

  let selectedType = "CustomerPayBillOnline";

  const btnBuyGoods = document.getElementById("type-buygoods");
  const btnPaybill = document.getElementById("type-paybill");

  const shortcodeInput = document.getElementById("daraja-shortcode");
  const keyInput = document.getElementById("daraja-key");
  const secretInput = document.getElementById("daraja-secret");
  const passkeyInput = document.getElementById("daraja-passkey");

  const testPhoneInput = document.getElementById("test-phone");
  const stkBtn = document.getElementById("trigger-stk-btn");
  const saveBtn = document.getElementById("save-daraja-btn");

  const statusBox = document.getElementById("stk-status-box");
  const statusBadge = document.getElementById("stk-status-badge");
  const statusText = document.getElementById("stk-status-text");

  function setAccountType(type) {
    selectedType = type;
    if (type === "CustomerPayBillOnline") {
      if (btnPaybill) {
        btnPaybill.className = "p-3.5 rounded-xl border-2 border-brand-600 bg-brand-50/50 text-xs font-bold text-brand-900 flex items-center justify-center gap-2 transition-all cursor-pointer";
        const icon = btnPaybill.querySelector('i, svg');
        if (icon) icon.className = "w-4 h-4 text-brand-600";
      }
      if (btnBuyGoods) {
        btnBuyGoods.className = "p-3.5 rounded-xl border border-brand-200 bg-white hover:border-brand-500 text-xs font-bold text-slate-600 flex items-center justify-center gap-2 transition-all cursor-pointer";
        const icon = btnBuyGoods.querySelector('i, svg');
        if (icon) icon.className = "w-4 h-4 text-slate-400";
      }
    } else {
      if (btnBuyGoods) {
        btnBuyGoods.className = "p-3.5 rounded-xl border-2 border-brand-600 bg-brand-50/50 text-xs font-bold text-brand-900 flex items-center justify-center gap-2 transition-all cursor-pointer";
        const icon = btnBuyGoods.querySelector('i, svg');
        if (icon) icon.className = "w-4 h-4 text-brand-600";
      }
      if (btnPaybill) {
        btnPaybill.className = "p-3.5 rounded-xl border border-brand-200 bg-white hover:border-brand-500 text-xs font-bold text-slate-600 flex items-center justify-center gap-2 transition-all cursor-pointer";
        const icon = btnPaybill.querySelector('i, svg');
        if (icon) icon.className = "w-4 h-4 text-slate-400";
      }
    }
  }

  if (btnBuyGoods) btnBuyGoods.addEventListener("click", () => setAccountType("CustomerBuyGoodsOnline"));
  if (btnPaybill) btnPaybill.addEventListener("click", () => setAccountType("CustomerPayBillOnline"));

  // Pre-load Active Configuration
  try {
    const res = await fetch(`${API_BASE}/settings`, { 
      headers: { 'x-tenant-id': TENANT_ID } 
    });
    const data = await res.json();
    if (data.success && data.tenant?.daraja) {
      const d = data.tenant.daraja;
      if (shortcodeInput && d.shortcode) shortcodeInput.value = d.shortcode;
      if (keyInput && d.consumerKey && !d.consumerKey.includes('•')) keyInput.value = d.consumerKey;
      if (secretInput && d.consumerSecret && !d.consumerSecret.includes('•')) secretInput.value = d.consumerSecret;
      if (passkeyInput && d.passkey && !d.passkey.includes('•')) passkeyInput.value = d.passkey;
      setAccountType(d.type || "CustomerPayBillOnline");
    }
  } catch (err) {
    console.warn("Could not pre-load Daraja credentials:", err.message);
  }

  // Save Credentials
  if (saveBtn) {
    saveBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const shortcode = shortcodeInput ? shortcodeInput.value.trim() : "174379";
      const passkey = passkeyInput ? passkeyInput.value.trim() : "";
      const consumerKey = keyInput ? keyInput.value.trim() : "";
      const consumerSecret = secretInput ? secretInput.value.trim() : "";

      const payload = {
        type: selectedType,
        shortcode: shortcode || "174379"
      };

      if (consumerKey && !consumerKey.includes('•')) payload.consumerKey = consumerKey;
      if (consumerSecret && !consumerSecret.includes('•')) payload.consumerSecret = consumerSecret;
      if (passkey && !passkey.includes('•')) payload.passkey = passkey;

      try {
        saveBtn.classList.add("opacity-60");
        saveBtn.textContent = "Saving...";

        let data;
        if (typeof window.API !== 'undefined' && typeof window.API.saveDarajaSettings === 'function') {
          data = await window.API.saveDarajaSettings(payload);
        } else {
          const res = await fetch(`${API_BASE}/payments/daraja`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-tenant-id': TENANT_ID
            },
            body: JSON.stringify(payload)
          });
          data = await res.json();
        }

        if (data.success) {
          alert(`✅ Daraja settings saved successfully!\nAccount Type: ${selectedType}\nShortcode: ${payload.shortcode}`);
        } else {
          throw new Error(data.message || "Failed to save");
        }
      } catch (err) {
        alert("❌ Failed to save credentials: " + err.message);
      } finally {
        saveBtn.classList.remove("opacity-60");
        saveBtn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Save Credentials`;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  // Trigger STK Push Test
  if (stkBtn) {
    stkBtn.addEventListener("click", async (e) => {
      e.preventDefault();

      let rawPhone = testPhoneInput ? testPhoneInput.value.trim().replace(/\D/g, '') : '';
      if (!rawPhone) {
        alert("Please enter a phone number (e.g., 0768820142) for the test prompt.");
        return;
      }

      let formattedPhone = rawPhone;
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '254' + formattedPhone.substring(1);
      } else if (formattedPhone.startsWith('7') || formattedPhone.startsWith('1')) {
        formattedPhone = '254' + formattedPhone;
      } else if (!formattedPhone.startsWith('254')) {
        formattedPhone = '254' + formattedPhone;
      }

      if (testPhoneInput) testPhoneInput.value = formattedPhone;

      stkBtn.classList.add("opacity-60");
      stkBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Triggering Prompt...`;
      if (window.lucide) lucide.createIcons();

      if (statusBox) statusBox.classList.remove("hidden");
      if (statusBadge) {
        statusBadge.className = "text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800";
        statusBadge.textContent = "DISPATCHING";
      }
      if (statusText) {
        statusText.textContent = `Connecting to Safaricom Daraja Gateway for +${formattedPhone}...`;
      }

      try {
        let resData;
        if (typeof window.API !== 'undefined' && typeof window.API.triggerTestSTK === 'function') {
          resData = await window.API.triggerTestSTK(formattedPhone);
        } else {
          const res = await fetch(`${API_BASE}/payments/test-stk`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-tenant-id': TENANT_ID
            },
            body: JSON.stringify({ testPhone: formattedPhone })
          });
          resData = await res.json().catch(() => null);
        }

        if (resData?.success && (resData.result?.ResponseCode === "0" || resData.result?.CheckoutRequestID)) {
          if (statusBadge) {
            statusBadge.className = "text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800";
            statusBadge.textContent = "SUCCESS (200 OK)";
          }
          if (statusText) {
            statusText.textContent = `[CheckoutRequestID: ${resData.result?.CheckoutRequestID || 'N/A'}]\n${resData.result?.CustomerMessage || 'Prompt delivered to handset. Enter your M-Pesa PIN!'}`;
          }
        } else {
          const errMsg = resData?.result?.errorMessage || resData?.result?.ResponseDescription || resData?.message || "Gateway rejection";
          throw new Error(errMsg);
        }
      } catch (err) {
        if (statusBadge) {
          statusBadge.className = "text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800";
          statusBadge.textContent = "FAILED";
        }
        if (statusText) {
          statusText.textContent = `Error: ${err.message}`;
        }
      } finally {
        stkBtn.classList.remove("opacity-60");
        stkBtn.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i> Trigger Test STK Push`;
        if (window.lucide) lucide.createIcons();
      }
    });
  }
});