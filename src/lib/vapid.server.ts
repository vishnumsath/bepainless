// VAPID JWT signer using Web Crypto (Cloudflare Workers compatible).
// Reads VAPID_PUBLIC_KEY (uncompressed 65-byte base64url), VAPID_PRIVATE_KEY (32-byte d, base64url), VAPID_SUBJECT.

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 2 ? "==" : s.length % 4 === 3 ? "=" : "";
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function strToB64url(s: string): string {
  return bytesToB64url(new TextEncoder().encode(s));
}

async function importPrivateKey(): Promise<CryptoKey> {
  const pub = b64urlToBytes(process.env.VAPID_PUBLIC_KEY!);
  const priv = b64urlToBytes(process.env.VAPID_PRIVATE_KEY!);
  if (pub[0] !== 0x04 || pub.length !== 65) throw new Error("Invalid VAPID_PUBLIC_KEY");
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: bytesToB64url(priv),
    ext: true,
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

export async function vapidAuthHeader(endpoint: string): Promise<string> {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
    sub: process.env.VAPID_SUBJECT || "mailto:admin@example.com",
  };
  const signingInput = `${strToB64url(JSON.stringify(header))}.${strToB64url(JSON.stringify(payload))}`;
  const key = await importPrivateKey();
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${bytesToB64url(new Uint8Array(sig))}`;
  return `vapid t=${jwt}, k=${process.env.VAPID_PUBLIC_KEY}`;
}
