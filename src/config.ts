export function validateEnvironment(env: Record<string, unknown>) {
  const port = Number(env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535');
  const secret = String(env.JWT_SECRET || '');
  if (secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');
  const database = String(env.DATABASE_URL || '');
  if (!/^postgres(ql)?:\/\//.test(database)) throw new Error('DATABASE_URL must be a PostgreSQL URL');
  const origins = String(env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(v => v.trim());
  if (origins.some(v => !/^https?:\/\/[^/]+$/.test(v) || v.includes('*'))) throw new Error('CORS_ORIGIN must list exact origins without trailing slashes');
  const hops = Number(env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(hops) || hops < 0 || hops > 2) throw new Error('TRUST_PROXY_HOPS must be 0–2');
  const ttl = Number(env.JWT_TTL_SECONDS || 86400);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 604800) throw new Error('JWT_TTL_SECONDS must be 60–604800');
  return {...env, PORT: port, TRUST_PROXY_HOPS: hops, JWT_TTL_SECONDS: ttl};
}
