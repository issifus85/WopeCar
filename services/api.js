import { getToken } from './tokenStorage';

// Legacy - will be replaced by Supabase services in Phase 4. Still the live
// backend for the app today (see services/supabaseApi.js for the parallel
// Supabase-backed functions being built alongside this one).

// Preprod for now - swap to the production host once these routes are
// verified and deployed there too.
export const API_BASE_URL = 'https://wopecarpreprod.com/api';

export class ApiError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

export async function request(path, { method = 'GET', body, auth = false } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const headers = {
    Accept: 'application/json',
  };
  // Let fetch set the multipart boundary itself for FormData bodies -
  // an explicit Content-Type here would omit it and the server can't
  // parse the parts.
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  if (auth) {
    const token = await getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message = json?.message || `Request failed (${response.status})`;
    throw new ApiError(message, response.status, json?.errors);
  }

  return json;
}
