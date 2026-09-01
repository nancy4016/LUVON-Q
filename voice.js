document.addEventListener("DOMContentLoaded", async () => {
  if (window.lucide) lucide.createIcons();

  let currentAudio = null;
  const backendBaseUrl = 'http://localhost:3000';

  // Available Free Default Stock Voices
  const freeVoices = [
    { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah (Soft & Professional Female)" },
    { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice (Expressive & Clear Female)" },
    { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura (Warm Commercial Female)" },
    { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica (Modern Concise Female)" },
    { id: "JBFqnCBsd6RMkjVDRZzb", name: "George (British Male)" }
  ];

  const voiceSelect = document.getElementById("voice-select") || document.querySelector("select");
  const escalationPhoneInput = document.getElementById("escalation-phone") || document.querySelector("input[type='tel'], input[placeholder*='Phone']");
  const playBtn = document.getElementById("play-sample-btn") || Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Play Voice Sample"));
  const saveBtn = document.getElementById("save-persona-btn") || Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Save Settings"));

  // Locate the actual text element inside the preview card
  const previewTextElement = document.querySelector(".bg-brand-900 p, [class*='bg-neutral-900'] p, .bg-stone-900 p, .bg-black p, p.italic") || 
                             Array.from(document.querySelectorAll("p")).find(p => p.textContent.includes("Air Force 1"));

  // Populate Voice Options
  if (voiceSelect) {
    voiceSelect.innerHTML = freeVoices
      .map(v => `<option value="${v.id}">${v.name}</option>`)
      .join("");
  }

  // 1. Load Existing Settings from Backend
  try {
    const res = await fetch(`${backendBaseUrl}/api/tenant/settings`, {
      headers: { 'x-tenant-id': 'luvon_q_flagship' }
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

      // Activate corresponding Tone Card
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

      if (window.lucide) lucide.createIcons();
    });
  });

  // 3. Real Neural Voice Sample Audio Preview Handler
  if (playBtn) {
    playBtn.addEventListener("click", async (e) => {
      e.preventDefault();

      if (currentAudio && !currentAudio.paused) {
        currentAudio.pause();
        currentAudio = null;
        playBtn.classList.remove("opacity-60");
        playBtn.innerHTML = `<i data-lucide="play" class="w-3.5 h-3.5"></i> Play Voice Sample`;
        if (window.lucide) lucide.createIcons();
        return;
      }

      const selectedVoice = voiceSelect?.value || "EXAVITQu4vr4xnSDxMaL";
      
      // Grab exact text displayed in the black preview card
      let previewText = "Niaje! Welcome to Nairobi Kicks Studio. We have 4 pairs of Air Force 1 White remaining in stock!";
      if (previewTextElement && previewTextElement.textContent.trim()) {
        previewText = previewTextElement.textContent.replace(/["“”]/g, '').trim();
      }

      playBtn.classList.add("opacity-60");
      playBtn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Generating Audio...`;
      if (window.lucide) lucide.createIcons();

      try {
        const response = await fetch(`${backendBaseUrl}/api/tenant/voice/preview`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tenant-id": "luvon_q_flagship"
          },
          body: JSON.stringify({
            voiceId: selectedVoice,
            text: previewText
          })
        });

        if (!response.ok) {
          throw new Error("Preview generation failed. Check API key status.");
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        currentAudio = new Audio(audioUrl);
        playBtn.innerHTML = `<i data-lucide="volume-2" class="w-3.5 h-3.5 animate-pulse"></i> Playing Sample...`;
        if (window.lucide) lucide.createIcons();

        currentAudio.play();

        currentAudio.onended = () => {
          playBtn.classList.remove("opacity-60");
          playBtn.innerHTML = `<i data-lucide="play" class="w-3.5 h-3.5"></i> Play Voice Sample`;
          if (window.lucide) lucide.createIcons();
        };
      } catch (err) {
        alert("Audio Preview Error: " + err.message);
        playBtn.classList.remove("opacity-60");
        playBtn.innerHTML = `<i data-lucide="play" class="w-3.5 h-3.5"></i> Play Voice Sample`;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  // 4. Save Settings Handler (POST /api/tenant/settings/personality)
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
            'x-tenant-id': 'luvon_q_flagship'
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
        saveBtn.textContent = "Save Settings";
      }
    });
  }
});