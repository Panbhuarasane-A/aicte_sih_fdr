const API_ORIGIN =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? 'https://aicte-sih-fdr-1.onrender.com' : '');
const API_BASE = API_ORIGIN.replace(/\/$/, '') + '/api';

export function getAuthToken() {
  return localStorage.getItem('aicte_access_token');
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem('aicte_access_token', token);
  } else {
    localStorage.removeItem('aicte_access_token');
  }
}

export async function apiRequest(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = { ...options.headers };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = `API request failed (${response.status})`;
    try {
      const errJson = await response.json();
      errorDetail = errJson.detail || errJson.message || errorDetail;
    } catch {
      try {
        const text = await response.text();
        if (text && text.trim()) errorDetail = text.slice(0, 200);
      } catch {
        // response wasn't readable
      }
    }
    throw new Error(errorDetail);
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

export async function downloadApiFile(endpoint) {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  return response.blob();
}

export const api = {
  // Auth
  login: (username, password) =>
    apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  getMe: () => apiRequest('/me'),

  // Institutions
  getInstitutions: (region) => apiRequest(region ? `/institutions?region=${region}` : '/institutions'),
  getInstitution: (id) => apiRequest(`/institutions/${id}`),
  getDepositCalc: (id, paidOverride) =>
    apiRequest(`/institutions/${id}/deposit-calc${paidOverride ? `?paid_override=${paidOverride}` : ''}`),

  // Instruments
  getInstruments: (params = '') => apiRequest(`/instruments${params ? `?${params}` : ''}`),
  createInstrument: (data) => apiRequest('/instruments', { method: 'POST', body: JSON.stringify(data) }),
  updateInstrument: (id, data) => apiRequest(`/instruments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Claims
  getClaims: (status) => apiRequest(status ? `/claims?status_filter=${status}` : '/claims'),
  submitClaim: (data) => apiRequest('/claims', { method: 'POST', body: JSON.stringify(data) }),
  verifyClaim: (id) => apiRequest(`/claims/${id}/verify`, { method: 'POST' }),
  officerVerifyClaim: (id, notes) =>
    apiRequest(`/claims/${id}/officer-verify`, { method: 'POST', body: JSON.stringify({ decision: 'OFFICER_VERIFIED', notes }) }),
  clarifyClaim: (id, notes) =>
    apiRequest(`/claims/${id}/clarify`, { method: 'POST', body: JSON.stringify({ decision: 'CLARIFICATION_REQUESTED', notes }) }),

  // Statements
  importStatement: (formData) => apiRequest('/statements/import', { method: 'POST', body: formData }),
  getStatements: () => apiRequest('/statements'),
  reverifyClaims: () => apiRequest('/statements/re-verify', { method: 'POST' }),

  // Documents
  getDocuments: (institutionId) => apiRequest(institutionId ? `/documents?institution_id=${institutionId}` : '/documents'),
  uploadDocument: (formData) => apiRequest('/documents', { method: 'POST', body: formData }),
  getDocumentExtraction: (id) => apiRequest(`/documents/${id}/extraction`),
  getDocumentScreening: (id) => apiRequest(`/documents/${id}/screening`),

  // Release Workflow
  getReleaseRequests: () => apiRequest('/release-requests'),
  submitReleaseRequest: (data) => apiRequest('/release-requests', { method: 'POST', body: JSON.stringify(data) }),
  recommendRelease: (id, notes) =>
    apiRequest(`/release-requests/${id}/recommend`, { method: 'POST', body: JSON.stringify({ notes }) }),
  authoriseRelease: (id, speakingOrderRef, notes) =>
    apiRequest(`/release-requests/${id}/authorise`, { method: 'POST', body: JSON.stringify({ speaking_order_ref: speakingOrderRef, notes }) }),
  rejectRelease: (id, notes) =>
    apiRequest(`/release-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ notes }) }),

  // Deductions
  recordDeduction: (data) => apiRequest('/deductions', { method: 'POST', body: JSON.stringify(data) }),
  getDeductions: () => apiRequest('/deductions'),

  // Mail
  sendMail: (data) => apiRequest('/mail/send', { method: 'POST', body: JSON.stringify(data) }),
  getMailOutbox: () => apiRequest('/mail/outbox'),

  // Announcements
  getAnnouncements: () => apiRequest('/announcements'),
  createAnnouncement: (formData) => apiRequest('/announcements', { method: 'POST', body: formData }),
  deleteAnnouncement: (announcementId) =>
    apiRequest(`/announcements/${encodeURIComponent(announcementId)}`, { method: 'DELETE' }),
  downloadAnnouncementAttachment: (announcementId, attachmentIndex) =>
    downloadApiFile(`/announcements/${encodeURIComponent(announcementId)}/attachments/${attachmentIndex}`),

  // Assistant
  askAssistant: (query) => apiRequest('/assistant/query', { method: 'POST', body: JSON.stringify({ query }) }),
  exportAssistantResult: (id, format = 'xlsx') => downloadApiFile(`/assistant/results/${encodeURIComponent(id)}/export?format=${format}`),

  // Dashboard & Audit
  getDashboardSummary: () => apiRequest('/dashboard/summary'),
  getAuditTrail: (limit = 100) => apiRequest(`/audit?limit=${limit}`),
  verifyAuditChain: () => apiRequest('/audit/verify'),
  downloadReport: (reportType) => apiRequest(`/reports/${encodeURIComponent(reportType)}`),

  // Rules
  getRules: () => apiRequest('/rules'),
  updateRule: (data) => apiRequest('/rules', { method: 'PUT', body: JSON.stringify(data) }),
};
