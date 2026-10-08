// settings.js - Workspace & Team Logic
(function () {
  const BASE_URL = (typeof window !== 'undefined' && window.location.origin && window.location.origin.includes('http') && !window.location.origin.includes('localhost'))
    ? window.location.origin
    : 'https://luvon-engine.onrender.com';

  function getActiveTenantId() {
    return localStorage.getItem('luvon_active_tenant_id') || 'luvon_q_flagship';
  }

  async function loadTeamMembers() {
    const tableBody = document.getElementById('team-table-body');
    if (!tableBody) return;

    try {
      const res = await fetch(`${BASE_URL}/api/tenant/team`, {
        headers: { 'x-tenant-id': getActiveTenantId() }
      });
      const data = await res.json();
      const members = Array.isArray(data.members) ? data.members : [];

      if (members.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="4" class="p-4 text-center text-slate-400">
              No additional team members invited yet.
            </td>
          </tr>
        `;
        if (window.lucide) lucide.createIcons();
        return;
      }

      tableBody.innerHTML = members.map(m => `
        <tr class="hover:bg-brand-50/50 transition-colors">
          <td class="p-3.5 font-medium text-brand-900">${m.email}</td>
          <td class="p-3.5 font-semibold text-slate-700">${m.role}</td>
          <td class="p-3.5"><span class="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-full">${m.status}</span></td>
          <td class="p-3.5 text-right">
            <button onclick="removeMember('${m.id}')" class="text-rose-600 hover:underline font-semibold cursor-pointer">Remove</button>
          </td>
        </tr>
      `).join('');

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.warn('Could not load team members:', err.message);
    }
  }

  async function handleInviteSubmit(e) {
    e.preventDefault();
    const emailInput = document.getElementById('invite-email');
    const roleSelect = document.getElementById('invite-role');
    const btn = document.getElementById('invite-btn');

    if (!emailInput || !emailInput.value.trim()) return;

    btn.disabled = true;
    btn.textContent = 'Inviting...';

    try {
      const res = await fetch(`${BASE_URL}/api/tenant/team/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getActiveTenantId()
        },
        body: JSON.stringify({
          email: emailInput.value.trim(),
          role: roleSelect ? roleSelect.value : 'Sales Agent'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to invite member');

      window.API.showToast(`Invitation sent to ${emailInput.value}!`, 'success');
      emailInput.value = '';
      loadTeamMembers();
    } catch (err) {
      window.API.showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="user-plus" class="w-4 h-4"></i> Invite Member`;
      if (window.lucide) lucide.createIcons();
    }
  }

  async function removeMember(memberId) {
    try {
      const res = await fetch(`${BASE_URL}/api/tenant/team/${memberId}`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': getActiveTenantId() }
      });
      if (res.ok) {
        window.API.showToast('Member removed from workspace.', 'info');
        loadTeamMembers();
      }
    } catch (err) {
      window.API.showToast(err.message, 'error');
    }
  }

  function openDeleteModal() {
    document.getElementById('deleteModal')?.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }

  function closeDeleteModal() {
    document.getElementById('deleteModal')?.classList.add('hidden');
  }

  async function executeAccountDeletion() {
    const input = document.getElementById('confirmDeleteInput');
    const btn = document.getElementById('confirmDeleteBtn');

    if (!input || input.value.trim() !== 'DELETE') {
      window.API.showToast('Please type DELETE exactly to confirm.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Terminating...';

    try {
      const res = await fetch(`${BASE_URL}/api/tenant/account`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getActiveTenantId()
        },
        body: JSON.stringify({ confirmation: 'DELETE' })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Deletion failed');

      localStorage.clear();
      window.API.showToast('Workspace terminated. Redirecting...', 'info');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1200);
    } catch (err) {
      window.API.showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Permanently Delete';
    }
  }

  window.removeMember = removeMember;
  window.openDeleteModal = openDeleteModal;
  window.closeDeleteModal = closeDeleteModal;
  window.executeAccountDeletion = executeAccountDeletion;

  document.addEventListener('DOMContentLoaded', () => {
    loadTeamMembers();
    document.getElementById('invite-member-form')?.addEventListener('submit', handleInviteSubmit);
  });
})();