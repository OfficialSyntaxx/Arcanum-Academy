import { z } from 'zod';

/**
 * Environment configuration, validated once at boot.
 *
 * A mistyped environment variable should crash the process on startup with a
 * precise message, not surface three hours later as a mysterious 500. Nothing
 * else in the server reads `process.env`.
 */

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Comma-separated list of origins allowed to open a socket. */
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  /** Hard cap on concurrent sockets per process. Protects memory under load. */
  MAX_CONNECTIONS: z.coerce.number().int().positive().default(2_000),
  /** Seconds a disconnected session stays resumable. */
  SESSION_RESUME_SECONDS: z.coerce.number().int().positive().default(120),
  SHUTDOWN_GRACE_MS: z.coerce.number().int().nonnegative().default(10_000),
});

export type ServerConfig = Readonly<
  z.infer<typeof schema> & { readonly allowedOrigins: readonly string[] }
>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid server configuration:\n${issues}`);
  }
  const allowedOrigins = parsed.data.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return Object.freeze({ ...parsed.data, allowedOrigins });
}
