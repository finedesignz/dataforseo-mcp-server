import { z } from 'zod';

// ── Shared primitives ───────────────────────────────────────────────────

export const id = z.number().int().positive().describe('Unique numeric ID');
export const slug = z.string().min(1).describe('URL-friendly slug');

export const status = z.enum(['publish', 'draft', 'pending', 'private', 'future', 'trash'])
  .describe('Publication status');

export const pagination = z.object({
  page: z.number().int().min(1).default(1).describe('Page number (default: 1)'),
  per_page: z.number().int().min(1).max(100).default(10).describe('Items per page, 1-100 (default: 10)'),
});

export const orderDir = z.enum(['asc', 'desc']).default('desc').describe('Sort direction');

/**
 * Optional _fields parameter to limit response payload.
 * Maps to WordPress REST API ?_fields=id,title,status
 */
export const fieldsParam = z.string().optional()
  .describe('Comma-separated list of fields to return (e.g. "id,title,status,slug"). Reduces response size.');

// ── Auth ────────────────────────────────────────────────────────────────

export const authSchema = z.object({
  siteUrl: z.string().url().optional().describe('WordPress site URL (e.g. https://example.com). Optional if WORDPRESS_URL env var is set.'),
  username: z.string().optional().describe('WordPress username. Optional if WORDPRESS_USERNAME env var is set.'),
  appPassword: z.string().optional().describe('WordPress Application Password. Optional if WORDPRESS_APP_PASSWORD env var is set.'),
}).optional().describe('WordPress credentials. Optional when server is configured with WORDPRESS_URL, WORDPRESS_USERNAME, and WORDPRESS_APP_PASSWORD env vars.');

export type Auth = { siteUrl: string; username: string; appPassword: string };

/**
 * Resolves auth credentials by merging per-call values with env var defaults.
 * Per-call values take precedence (enables multi-site override).
 * Throws a user-friendly error if any credential is missing.
 */
export function resolveAuth(auth?: z.infer<typeof authSchema>): Auth {
  const siteUrl = auth?.siteUrl || process.env.WORDPRESS_URL || '';
  const username = auth?.username || process.env.WORDPRESS_USERNAME || '';
  const appPassword = auth?.appPassword || process.env.WORDPRESS_APP_PASSWORD || '';

  const missing: string[] = [];
  if (!siteUrl) missing.push('siteUrl (or WORDPRESS_URL env var)');
  if (!username) missing.push('username (or WORDPRESS_USERNAME env var)');
  if (!appPassword) missing.push('appPassword (or WORDPRESS_APP_PASSWORD env var)');

  if (missing.length > 0) {
    throw new Error(`Missing WordPress credentials: ${missing.join(', ')}`);
  }

  return { siteUrl: siteUrl.replace(/\/+$/, ''), username, appPassword };
}

/**
 * Wraps a Zod object schema with the auth fields.
 * Auth is optional per-call when env vars are configured.
 */
export function withAuth<T extends z.ZodRawShape>(shape: z.ZodObject<T>) {
  return z.object({ auth: authSchema }).merge(shape);
}

// ── Query builder ───────────────────────────────────────────────────────

/**
 * Build a query string from an object, skipping undefined/null values.
 * - Booleans serialize as "true"/"false" (not "1"/"0") — WP REST accepts both
 * - Arrays serialize as repeated params: categories[]=1&categories[]=2
 * - The special `_fields` key is passed through directly
 */
export function buildQuery(params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        parts.push(`${encodeURIComponent(key)}[]=${encodeURIComponent(String(v))}`);
      }
    } else if (typeof value === 'boolean') {
      // WordPress REST API treats these params as boolean:
      // send the string "true"/"false" (WP also accepts 1/0)
      parts.push(`${encodeURIComponent(key)}=${value ? 'true' : 'false'}`);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

// ── Response helpers ────────────────────────────────────────────────────

/**
 * Format a tool response as MCP content.
 */
export function ok(data: unknown, prefix?: string) {
  const text = prefix
    ? `${prefix}\n\n${JSON.stringify(data, null, 2)}`
    : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text' as const, text }] };
}

export function err(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const };
}

// ── MCP Tool Annotations ────────────────────────────────────────────────

/** Read-only tool: does not modify any data */
export const readOnly = {
  readOnlyHint: true as const,
  destructiveHint: false as const,
  openWorldHint: true as const,
};

/** Mutation tool: modifies data but is not destructive */
export const mutation = {
  readOnlyHint: false as const,
  destructiveHint: false as const,
  openWorldHint: true as const,
};

/** Destructive tool: permanently deletes data or is hard to reverse */
export const destructive = {
  readOnlyHint: false as const,
  destructiveHint: true as const,
  openWorldHint: true as const,
};
