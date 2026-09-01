// api.js
const API_BASE = '/api/tenant';
const TENANT_ID = 'luvon_q_flagship';

async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': TENANT_ID,
      ...(options.headers || {})
    }
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = data?.message || data?.error || data?.details?.errorMessage || `Request failed with status ${response.status}`;
      throw new Error(errorMsg);
    }
    return data;
  } catch (err) {
    console.error(`API Call failed on [${endpoint}]:`, err.message);
    throw err;
  }
}

// Global API Helper Objects
const API = {
  getSettings: () => apiCall('/settings'),
  saveSettings: (payload) => apiCall('/settings/personality', { method: 'POST', body: JSON.stringify(payload) }),
  getInventory: () => apiCall('/inventory'),
  saveInventoryItem: (item) => apiCall('/inventory', { method: 'POST', body: JSON.stringify(item) }),
  getMetrics: () => apiCall('/metrics'),
  getConversations: () => apiCall('/conversations'),
  saveDarajaSettings: (payload) => apiCall('/payments/daraja', { method: 'POST', body: JSON.stringify(payload) }),
  triggerTestSTK: (testPhone) => apiCall('/payments/test-stk', { method: 'POST', body: JSON.stringify({ testPhone }) }),
  previewVoice: (voiceId, text) => fetch(`${API_BASE}/voice/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': TENANT_ID },
    body: JSON.stringify({ voiceId, text })
  })
};