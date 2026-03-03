import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WordPressClient } from '../client/wpClient.js';
import {
  id, withAuth, buildQuery, ok, err, resolveAuth,
  readOnly, mutation,
} from '../utils/validate.js';

const makeClient = (rawAuth?: { siteUrl?: string; username?: string; appPassword?: string }) => {
  const a = resolveAuth(rawAuth);
  return new WordPressClient({ baseUrl: a.siteUrl, username: a.username, appPassword: a.appPassword });
};

const RANKMATH_META_PREREQUISITE = [
  'PREREQUISITE: RankMath meta keys must be registered as REST-accessible on the WordPress site.',
  'Add this to functions.php or a custom plugin:',
  '',
  "add_action('init', function() {",
  "  $keys = ['rank_math_title', 'rank_math_description', 'rank_math_focus_keyword',",
  "    'rank_math_canonical_url', 'rank_math_robots', 'rank_math_facebook_title',",
  "    'rank_math_facebook_description', 'rank_math_facebook_image',",
  "    'rank_math_twitter_title', 'rank_math_twitter_description',",
  "    'rank_math_primary_category', 'rank_math_schema'];",
  '  foreach ($keys as $key) {',
  "    register_meta('post', $key, [",
  "      'show_in_rest'  => true,",
  "      'single'        => true,",
  "      'type'          => 'string',",
  "      'auth_callback' => function() { return current_user_can('edit_posts'); },",
  '    ]);',
  '  }',
  '});',
].join('\n');

export function registerSeoTools(server: McpServer) {
  // ─── GET HEAD (public, no meta registration needed) ───────────────────

  server.registerTool(
    'get_rankmath_head',
    {
      title: 'Get RankMath SEO Head Tags',
      description: 'Get the rendered HTML head tags (title, meta description, canonical, OG tags, schema) that RankMath generates for a URL. Requires "Headless CMS Support" enabled in RankMath Dashboard > Others.',
      annotations: readOnly,
      inputSchema: withAuth(
        z.object({
          url: z.string().url().describe('Full page URL to get SEO head for (e.g. "https://example.com/about/")'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const result = await wp.call<{ success: boolean; head: string }>(
        `/rankmath/v1/getHead${buildQuery({ url: input.url })}`,
      );
      if (!result.success) {
        return err('RankMath getHead failed. Ensure Headless CMS Support is enabled in RankMath > Dashboard > Others.');
      }
      return ok({ url: input.url, head_html: result.head });
    },
  );

  // ─── GET SEO META (via post/page meta) ────────────────────────────────

  server.registerTool(
    'get_rankmath_meta',
    {
      title: 'Get RankMath SEO Meta for Post/Page',
      description: `Read all RankMath SEO meta fields for a post or page (title, description, focus keyword, canonical, robots, social, schema).\n\n${RANKMATH_META_PREREQUISITE}`,
      annotations: readOnly,
      inputSchema: withAuth(
        z.object({
          id: id.describe('Post or page ID'),
          type: z.enum(['post', 'page']).default('post').describe('Content type'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const endpoint = input.type === 'page' ? 'pages' : 'posts';
      const data = await wp.call<Record<string, unknown>>(
        `/wp/v2/${endpoint}/${input.id}?context=edit`,
      );

      const meta = (data.meta ?? {}) as Record<string, unknown>;

      const rmKeys = Object.keys(meta).filter(k => k.startsWith('rank_math_'));
      if (rmKeys.length === 0) {
        return err(
          `No RankMath meta found for ${input.type} ID ${input.id}.\n\n` +
          'This likely means the meta keys are not registered as REST-accessible.\n\n' +
          RANKMATH_META_PREREQUISITE,
        );
      }

      const rankMathMeta: Record<string, unknown> = {};
      for (const key of rmKeys) {
        rankMathMeta[key] = meta[key];
      }

      return ok({
        id: input.id,
        type: input.type,
        rankmath: rankMathMeta,
      });
    },
  );

  // ─── UPDATE SEO META (via post/page meta) ────────────────────────────

  server.registerTool(
    'update_rankmath_meta',
    {
      title: 'Update RankMath SEO Meta for Post/Page',
      description: `Update RankMath SEO meta fields via the WordPress REST API. Only include fields to change.\n\n${RANKMATH_META_PREREQUISITE}`,
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          id: id.describe('Post or page ID'),
          type: z.enum(['post', 'page']).default('post').describe('Content type'),
          rank_math_title: z.string().optional().describe('SEO title (supports RankMath variables like %title%, %sep%, %sitename%)'),
          rank_math_description: z.string().optional().describe('Meta description'),
          rank_math_focus_keyword: z.string().optional().describe('Focus keyword(s), comma-separated for multiple'),
          rank_math_canonical_url: z.string().optional().describe('Canonical URL override'),
          rank_math_robots: z.array(z.string()).optional()
            .describe('Robots directives array (e.g. ["noindex", "nofollow"])'),
          rank_math_facebook_title: z.string().optional().describe('Open Graph title'),
          rank_math_facebook_description: z.string().optional().describe('Open Graph description'),
          rank_math_facebook_image: z.string().optional().describe('Open Graph image URL'),
          rank_math_twitter_title: z.string().optional().describe('Twitter card title'),
          rank_math_twitter_description: z.string().optional().describe('Twitter card description'),
          rank_math_primary_category: z.number().int().optional().describe('Primary category ID'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const endpoint = input.type === 'page' ? 'pages' : 'posts';
      const { id: postId, auth, type, ...fields } = input;

      const meta: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          if (key === 'rank_math_robots' && Array.isArray(value)) {
            meta[key] = value.join(',');
          } else {
            meta[key] = value;
          }
        }
      }

      if (Object.keys(meta).length === 0) {
        return err('No RankMath fields provided to update.');
      }

      const result = await wp.call(`/wp/v2/${endpoint}/${postId}`, 'POST', { meta });
      return ok(result, `RankMath meta updated for ${type} ID ${postId}.`);
    },
  );

  // ─── UPDATE VIA RANKMATH INTERNAL API ─────────────────────────────────

  server.registerTool(
    'rankmath_update_meta_internal',
    {
      title: 'Update RankMath Meta (Internal API)',
      description: 'Update RankMath SEO meta using RankMath\'s internal /rankmath/v1/updateMeta endpoint. This works without registering meta keys but requires RankMath to be active. Use this as an alternative if the REST meta approach fails.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          objectID: id.describe('Post or page ID'),
          objectType: z.enum(['post', 'term', 'user']).default('post').describe('Object type'),
          meta: z.record(z.string()).describe('RankMath meta key-value pairs (e.g. {"rank_math_title": "My Title", "rank_math_description": "My desc"})'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const result = await wp.call('/rankmath/v1/updateMeta', 'POST', {
        objectID: input.objectID,
        objectType: input.objectType,
        meta: input.meta,
      });
      return ok(result, `RankMath meta updated for ${input.objectType} ID ${input.objectID} via internal API.`);
    },
  );

  // ─── RANKMATH SCHEMA ──────────────────────────────────────────────────

  server.registerTool(
    'update_rankmath_schema',
    {
      title: 'Update RankMath Schema Markup',
      description: 'Update schema (structured data / JSON-LD) for a post or page using RankMath\'s internal endpoint.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          objectID: id.describe('Post or page ID'),
          schemas: z.record(z.unknown())
            .describe('Schema data object. Each key is a schema ID, value is the schema definition with @type, properties, etc.'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const result = await wp.call('/rankmath/v1/updateSchemas', 'POST', {
        objectID: input.objectID,
        schemas: input.schemas,
      });
      return ok(result, `Schema updated for post ID ${input.objectID}.`);
    },
  );

  // ─── RANKMATH REDIRECTIONS ────────────────────────────────────────────

  server.registerTool(
    'update_rankmath_redirection',
    {
      title: 'Create/Update RankMath Redirection',
      description: 'Create or update a redirect rule using RankMath\'s internal endpoint. Requires RankMath Redirections module to be enabled.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          id: z.number().int().optional().describe('Redirection ID to update (omit to create new)'),
          url_to: z.string().describe('Destination URL to redirect to'),
          sources: z.array(
            z.object({
              pattern: z.string().describe('Source URL pattern'),
              comparison: z.enum(['exact', 'contains', 'start', 'end', 'regex']).default('exact')
                .describe('Pattern match type'),
            }),
          ).describe('Source URL patterns that trigger the redirect'),
          header_code: z.enum(['301', '302', '307', '410', '451']).default('301')
            .describe('HTTP redirect status code'),
          status: z.enum(['active', 'inactive']).default('active').describe('Redirection rule status'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...body } = input;
      const result = await wp.call('/rankmath/v1/updateRedirection', 'POST', body);
      return ok(result, 'Redirection rule saved.');
    },
  );

  // ─── INDEX NOW ────────────────────────────────────────────────────────

  server.registerTool(
    'rankmath_index_now',
    {
      title: 'Submit URLs to IndexNow via RankMath',
      description: 'Submit URLs to search engines via IndexNow (Bing, Yandex, etc.) using RankMath\'s IndexNow module. Module must be enabled in RankMath.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          urls: z.array(z.string().url()).min(1).describe('URLs to submit for indexing'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const result = await wp.call('/rankmath/v1/in/submitUrls', 'POST', {
        urls: input.urls,
      });
      return ok(result, `Submitted ${input.urls.length} URL(s) to IndexNow.`);
    },
  );
}
