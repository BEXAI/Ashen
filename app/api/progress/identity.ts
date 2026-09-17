// Anonymous browser sessions are separate from existing signed-in saves.
// Only a hash of the unguessable guest token is used as the database owner key.
const COOKIE = '__Host-ashen-guest';
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

export async function playerIdentity(request: Request) {
  const account = request.headers.get('oai-authenticated-user-id');
  if (account) return { user: account, guest: false, cookie: undefined };

  const value = request.headers.get('Cookie')?.split(';')
    .map(part => part.trim()).find(part => part.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  const token = value && /^[a-f0-9]{64}$/.test(value)
    ? value
    : hex(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return {
    user: 'guest:' + hex(new Uint8Array(digest)),
    guest: true,
    cookie: `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000`,
  };
}
