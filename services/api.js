import { getToken } from './tokenStorage';

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
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (auth) {
    const token = await getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message = json?.message || `Request failed (${response.status})`;
    throw new ApiError(message, response.status, json?.errors);
  }

  return json;
}
