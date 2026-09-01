// api.js
const API_BASE = '/api/tenant';
const TENANT_ID = 'luvon_q_flagship';

async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': TENANT_ID,
      ...(options.headers || {})
    }
  };

  const response = await fetch(url, config);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Error ${response.status}`);
  }
  return response.json();
}