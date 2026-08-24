document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();

  // Tone Archetype Radio Card Selection Effect
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

      if (window.lucide) lucide.createIcons();
    });
  });

  // Voice Sample Audio Preview Handler
  const playBtn = document.getElementById("play-sample-btn");
  if (playBtn) {
    playBtn.addEventListener("click", () => {
      playBtn.classList.add("opacity-60");
      playBtn.innerHTML = `<i data-lucide="volume-2" class="w-3.5 h-3.5 animate-pulse"></i> Playing Audio...`;
      if (window.lucide) lucide.createIcons();

      setTimeout(() => {
        playBtn.classList.remove("opacity-60");
        playBtn.innerHTML = `<i data-lucide="play" class="w-3.5 h-3.5"></i> Play Voice Sample`;
        if (window.lucide) lucide.createIcons();
      }, 2500);
    });
  }

  // Save Settings Handler
  const saveBtn = document.getElementById("save-persona-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const selectedVoice = document.getElementById("voice-select").value;
      const escalationPhone = document.getElementById("escalation-phone").value;
      
      alert(`Persona settings saved successfully!\nVoice ID: ${selectedVoice}\nEscalation Phone: ${escalationPhone}`);
    });
  }
});