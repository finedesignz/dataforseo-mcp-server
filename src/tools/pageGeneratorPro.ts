import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WordPressClient } from '../client/wpClient.js';
import {
  id, pagination, status, orderDir, fieldsParam,
  withAuth, buildQuery, ok, resolveAuth,
  readOnly, mutation, destructive,
} from '../utils/validate.js';
import { stripHtml } from '../utils/format.js';

const REST_BASE = 'page-generator-pro';

const makeClient = (rawAuth?: { siteUrl?: string; username?: string; appPassword?: string }) => {
  const a = resolveAuth(rawAuth);
  return new WordPressClient({ baseUrl: a.siteUrl, username: a.username, appPassword: a.appPassword });
};

/**
 * Page Generator Pro support (content group CRUD via WP REST).
 *
 * Note: The plugin's "Generate Content" actions are wp-admin AJAX endpoints that
 * require a logged-in cookie + nonce. Those cannot be called with application
 * passwords, so this module focuses on managing Content Groups only.
 */
export function registerPageGeneratorProTools(server: McpServer) {
  server.registerTool(
    'list_page_generator_groups',
    {
      title: 'List Page Generator Pro Content Groups',
      description: 'List Page Generator Pro groups (custom post type "page-generator-pro"). Generation actions must still be run from WP Admin because the plugin uses nonces.',
      annotations: readOnly,
      inputSchema: withAuth(
        pagination.extend({
          status: z.enum(['publish', 'draft', 'pending', 'private', 'future', 'trash', 'any'])
            .default('publish').describe('Filter by status'),
          search: z.string().optional().describe('Search by keyword'),
          orderby: z.enum(['date', 'modified', 'title', 'id', 'slug']).default('date').describe('Sort field'),
          order: orderDir,
          _fields: fieldsParam,
          context: z.enum(['view', 'edit']).default('view').describe('WP REST response context'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...params } = input;
      const result = await wp.list(`/wp/v2/${REST_BASE}${buildQuery(params)}`);
      return ok({
        items: (result.data as Record<string, unknown>[]).map(item => ({
          id: item.id,
          title: stripHtml(String((item as any)?.title?.rendered ?? item.title ?? '')),
          status: item.status,
          slug: item.slug,
          date: item.date,
          modified: item.modified,
          link: item.link,
        })),
        total: result.total,
        totalPages: result.totalPages,
      });
    },
  );

  server.registerTool(
    'get_page_generator_group',
    {
      title: 'Get Page Generator Pro Content Group',
      description: 'Fetch a single Page Generator Pro group by ID.',
      annotations: readOnly,
      inputSchema: withAuth(
        z.object({
          id,
          context: z.enum(['view', 'edit']).default('view'),
          _fields: fieldsParam,
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const params = buildQuery({ context: input.context, _fields: input._fields });
      const group = await wp.call(`/wp/v2/${REST_BASE}/${input.id}${params}`);
      return ok(group);
    },
  );

  server.registerTool(
    'create_page_generator_group',
    {
      title: 'Create Page Generator Pro Content Group',
      description: 'Create a new Page Generator Pro group via WP REST. Provide meta/fields exactly as required by your site setup.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          title: z.string().optional().describe('Group title'),
          content: z.string().optional().describe('Main content/body for the group'),
          status: status.default('draft'),
          slug: z.string().optional(),
          meta: z.record(z.unknown()).optional().describe('Custom meta values (must exist in the site)'),
          fields: z.record(z.unknown()).optional().describe('Additional raw fields to send through as-is'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, fields, ...body } = input;
      const payload = { ...body, ...fields };
      const group = await wp.call(`/wp/v2/${REST_BASE}`, 'POST', payload);
      return ok(group, 'Content group created.');
    },
  );

  server.registerTool(
    'update_page_generator_group',
    {
      title: 'Update Page Generator Pro Content Group',
      description: 'Update an existing Page Generator Pro group. Only include fields you want to change.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          id,
          title: z.string().optional(),
          content: z.string().optional(),
          status: status.optional(),
          slug: z.string().optional(),
          meta: z.record(z.unknown()).optional(),
          fields: z.record(z.unknown()).optional(),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, id: groupId, fields, ...body } = input;
      const payload = { ...body, ...fields };
      const group = await wp.call(`/wp/v2/${REST_BASE}/${groupId}`, 'POST', payload);
      return ok(group, `Content group ${groupId} updated.`);
    },
  );

  server.registerTool(
    'delete_page_generator_group',
    {
      title: 'Delete Page Generator Pro Content Group',
      description: 'Delete (or trash) a Page Generator Pro group.',
      annotations: destructive,
      inputSchema: withAuth(
        z.object({
          id,
          force: z.boolean().default(false).describe('true = permanent delete, false = move to trash'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const result = await wp.call(
        `/wp/v2/${REST_BASE}/${input.id}${buildQuery({ force: input.force })}`,
        'DELETE',
      );
      return ok(result, `Content group ${input.id} deleted.`);
    },
  );

  server.registerTool(
    'generate_page_generator_group',
    {
      title: 'Run Page Generator Pro generation (browser-only)',
      description: 'Guides the agent/user to run generation in the WP Admin UI. Page Generator Pro uses nonce-protected admin-ajax endpoints that cannot be called with application passwords.',
      annotations: readOnly,
      inputSchema: withAuth(
        z.object({
          groupId: id.describe('ID of the Content Group to open in WP Admin'),
        }),
      ),
    },
    async (input) => {
      // No API call; return human/browser instructions
      const urlBase = resolveAuth(input.auth).siteUrl.replace(/\/+$/, '');
      const adminUrl = `${urlBase}/wp-admin/post.php?post=${input.groupId}&action=edit`;
      const steps = [
        `Open ${adminUrl} in a logged-in browser session.`,
        'Click the "Generate" button in the Page Generator Pro metabox.',
        'Choose generation mode (browser/CLI/queue) and confirm. Nonces are injected by the admin page, so API/app-password calls will fail.',
        'Monitor progress in the modal; if batching is enabled, keep the tab open until completion.',
      ].join('\n- ');
      const message = `Use the browser for generation:\n- ${steps}\n\nWhy: Page Generator Pro runs via wp-admin AJAX with nonces and cookies; application passwords cannot satisfy these checks.`;
      return ok({ instructions: message });
    },
  );
}
