// Sign in with Apple server-side calls (code exchange + token revocation). Needs these Edge Function secrets,
// created from an Apple Developer "Sign in with Apple" key:
//   APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (the .p8 file contents), and optionally APPLE_CLIENT_ID
//   (defaults to the app's bundle id, which is the client id for the native flow).
// Until they are set every function here reports "not configured" and callers carry on without it.

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

export function appleClientId(): string {
  return Deno.env.get('APPLE_CLIENT_ID') || 'com.wopecar.WopeCar';
}

export function isAppleConfigured(): boolean {
  return !!(Deno.env.get('APPLE_TEAM_ID') && Deno.env.get('APPLE_KEY_ID') && Deno.env.get('APPLE_PRIVATE_KEY'));
}

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function clientSecret(): Promise<string> {
  const teamId = Deno.env.get('APPLE_TEAM_ID')!;
  const keyId = Deno.env.get('APPLE_KEY_ID')!;
  const pem = Deno.env.get('APPLE_PRIVATE_KEY')!.replace(/\\n/g, '\n');
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: teamId, iat: now, exp: now + 300, aud: 'https://appleid.apple.com', sub: appleClientId() }));
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(signature)}`;
}

/** Exchanges the sign-in authorization code for Apple's refresh token. Returns null when it fails. */
export async function exchangeAppleCode(code: string): Promise<string | null> {
  const res = await fetch(APPLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: appleClientId(), client_secret: await clientSecret(), code, grant_type: 'authorization_code' }),
  });
  if (!res.ok) {
    console.error('Apple code exchange failed:', res.status, await res.text());
    return null;
  }
  const json = await res.json();
  return typeof json.refresh_token === 'string' ? json.refresh_token : null;
}

/** Revokes a refresh token with Apple. Returns true on success. */
export async function revokeAppleToken(refreshToken: string): Promise<boolean> {
  const res = await fetch(APPLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: appleClientId(), client_secret: await clientSecret(), token: refreshToken, token_type_hint: 'refresh_token' }),
  });
  if (!res.ok) console.error('Apple token revoke failed:', res.status, await res.text());
  return res.ok;
}
