/**
 * generate-keys.js
 * Generates all secrets and API keys needed for self-hosted Supabase.
 * Uses only Node.js built-in modules (no dependencies).
 *
 * Run: node docker/generate-keys.js
 * Outputs to console; copy into .env.supabase or .env as needed.
 */

const crypto = require("crypto");

function hex(len) {
  return crypto.randomBytes(len).toString("hex");
}

function base64(len) {
  return crypto.randomBytes(len).toString("base64");
}

function base64url(buf) {
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signHS256(payload, secret) {
  const header = base64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(header + "." + body);
  const signature = base64url(hmac.digest());
  return header + "." + body + "." + signature;
}

const JWT_SECRET = hex(32);
const now = Math.floor(Date.now() / 1000);
const exp = now + 3600 * 24 * 365 * 10;

const ANON_KEY = signHS256(
  { role: "anon", iss: "supabase", iat: now, exp },
  JWT_SECRET
);

const SERVICE_ROLE_KEY = signHS256(
  { role: "service_role", iss: "supabase", iat: now, exp },
  JWT_SECRET
);

const output = {
  POSTGRES_PASSWORD: hex(32),
  JWT_SECRET,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  DASHBOARD_USERNAME: "admin",
  DASHBOARD_PASSWORD: hex(8),
  SECRET_KEY_BASE: base64(48),
  VAULT_ENC_KEY: hex(16),
  PG_META_CRYPTO_KEY: base64(24),
  S3_PROTOCOL_ACCESS_KEY_ID: hex(16),
  S3_PROTOCOL_ACCESS_KEY_SECRET: hex(32),
};

console.log("# =============================================================================");
console.log("# Supabase self-hosted secrets (generated " + new Date().toISOString() + ")");
console.log("# Copy these into your .env file before running docker compose");
console.log("# =============================================================================");
console.log("");
for (const [key, value] of Object.entries(output)) {
  console.log(`${key}=${value}`);
}
