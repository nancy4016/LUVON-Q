document.addEventListener("DOMContentLoaded", async () => {
  if (window.lucide && typeof window.lucide.createIcons === 'function') lucide.createIcons();

  let currentAudio = null;
  const backendBaseUrl = (typeof window !== 'undefined' && window.location.origin && window.location.origin.includes('http') && !window.location.origin.includes('localhost'))
    ? window.location.origin
    : 'https://luvon-engine.onrender.com';

  function getActiveTenantId() {
    return localStorage.getItem('luvon_active_tenant_id') || 'anonymous';
  }

  const freeVoices = [
    { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah (Soft & Professional Female)" },
    { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice (Expressive & Clear Female)" },
    { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura (Warm Commercial Female)" },
    { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica (Modern Concise Female)" },
    { id: "JBFqnCBsd6RMkjVDRZzb", name: "George (British Male)" }
  ];

  const voiceSelect = document.getElementById("voice-select");
  const escalationPhoneInput = document.getElementById("escalation-phone");
  const playBtn = document.getElementById("play-sample-btn");
  const saveBtn = document.getElementById("save-persona-btn");
  const previewTextElement = document.getElementById("sample-text");

  if (voiceSelect) {
    voiceSelect.innerHTML = freeVoices
      .map(v => `<option value="${v.id}">${v.name}</option>`)
      .join("");
  }

  // 1. Load Existing Settings from Backend
  try {
    const res = await fetch(`${backendBaseUrl}/api/tenant/settings`, {
      headers: { 'x-tenant-id': getActiveTenantId() }
    });
    const data = await res.json();

    if (data.success && data.tenant) {
      const tenant = data.tenant;

      if (voiceSelect && tenant.elevenLabsVoiceId) {
        voiceSelect.value = tenant.elevenLabsVoiceId;
      }
      if (escalationPhoneInput && tenant.escalationPhone) {
        escalationPhoneInput.value = tenant.escalationPhone;
      }

      if (tenant.tone) {
        const matchingRadio = document.querySelector(`input[name="tone_archetype"][value="${tenant.tone}"]`);
        if (matchingRadio) {
          const parentLabel = matchingRadio.closest('label');
          if (parentLabel) parentLabel.click();
        }
      }
    }
  } catch (err) {
    console.warn("Could not pre-populate tenant settings:", err.message);
  }

  // 2. Tone Archetype Radio Card Selection Effect
  const radioLabels = document.querySelectorAll('label:has(input[name="tone_archetype"])');
  radioLabels.forEach(label => {
    label.addEventListener('click', () => {
      radioLabels.forEach(l => {
        l.className = "p-4 rounded-xl border border-brand-200 bg-white hover:border-brand-500 cursor-pointer transition-all flex flex-col justify-between space-y-3";
        const icon = l.querySelector('[data-lucide]');
        if (icon) icon.setAttribute('data-lucide', 'circle');
      });

      label.className = "p-4 rounded-xl border-2 border-brand-600 bg-brand-50/50 cursor-pointer transition-all flex flex-col justify-between space-y-3 relative";
      const activeIcon = label.querySelector('[data-lucide]');
      if (activeIcon) activeIcon.setAttribute('data-lucide', 'check-circle-2');

      const radioInput = label.querySelector('input[name="tone_archetype"]');
      if (radioInput) radioInput.checked = true;

      if (window.lucide && typeof window.lucide.createIcons === 'function') lucide.createIcons();
    });
  });

  // 3. Audio Preview Handler
  if (playBtn) {
    playBtn.addEventListener("click", async (e) => {
      e.preventDefault();

      if (currentAudio && !currentAudio.paused) {
        currentAudio.pause();
        currentAudio = null;
        playBtn.classList.remove("opacity-60");
        playBtn.innerHTML = `<i data-lucide="play" class="w-3.5 h-3.5"></i> Play Voice Sample`;
        if (window.lucide && typeof window.lucide.createIcons === 'function') lucide.createIcons();
        return;
      }

      const selectedVoice = voiceSelect?.value || "EXAVITQu4vr4xnSDxMaL";
      const previewText = previewTextElement?.textContent?.replace(/["“”]/g, '').trim() || "Karibu! How can I assist you today?";

      playBtn.classList.add("opacity-60");
      playBtn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Generating Audio...`;
      if (window.lucide && typeof window.lucide.createIcons === 'function') lucide.createIcons();

      try {
        const response = await fetch(`${backendBaseUrl}/api/tenant/voice/preview`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tenant-id": getActiveTenantId()
          },
          body: JSON.stringify({
            voiceId: selectedVoice,
            text: previewText
          })
        });

        if (!response.ok) {
          throw new Error("Preview generation failed.");
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        currentAudio = new Audio(audioUrl);
        playBtn.innerHTML = `<i data-lucide="volume-2" class="w-3.5 h-3.5 animate-pulse"></i> Playing Sample...`;
        if (window.lucide && typeof window.lucide.createIcons === 'function') lucide.createIcons();

        currentAudio.play();

        currentAudio.onended = () => {
          playBtn.classList.remove("opacity-60");
          playBtn.innerHTML = `<i data-lucide="play" class="w-3.5 h-3.5"></i> Play Voice Sample`;
          if (window.lucide && typeof window.lucide.createIcons === 'function') lucide.createIcons();
        };
      } catch (err) {
        alert("Audio Preview Notice: " + err.message);
        playBtn.classList.remove("opacity-60");
        playBtn.innerHTML = `<i data-lucide="play" class="w-3.5 h-3.5"></i> Play Voice Sample`;
        if (window.lucide && typeof window.lucide.createIcons === 'function') lucide.createIcons();
      }
    });
  }

  // 4. Save Settings Handler
  if (saveBtn) {
    saveBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const selectedVoice = voiceSelect?.value || "EXAVITQu4vr4xnSDxMaL";
      const escalationPhone = escalationPhoneInput?.value.trim().replace(/\+/g, '') || "";
      const selectedToneInput = document.querySelector('input[name="tone_archetype"]:checked');
      const selectedTone = selectedToneInput ? selectedToneInput.value : "luxury_chic";

      const payload = {
        tone: selectedTone,
        elevenLabsVoiceId: selectedVoice,
        escalationPhone: escalationPhone
      };

      try {
        saveBtn.classList.add("opacity-60");
        saveBtn.textContent = "Saving...";

        const response = await fetch(`${backendBaseUrl}/api/tenant/settings/personality`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': getActiveTenantId()
          },
          body: JSON.stringify(payload)
        });

        const resData = await response.json();
        if (resData.success) {
          alert(`✅ Settings Saved!\nTone: ${selectedTone}\nVoice ID: ${selectedVoice}\nEscalation Phone: +${escalationPhone}`);
        } else {
          throw new Error("Could not update settings");
        }
      } catch (err) {
        alert("❌ Failed to save voice settings: " + err.message);
      } finally {
        saveBtn.classList.remove("opacity-60");
        saveBtn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Save Settings`;
        if (window.lucide && typeof window.lucide.createIcons === 'function') lucide.createIcons();
      }
    });
  }
});