import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WordPressClient } from '../client/wpClient.js';
import {
  id, pagination, fieldsParam,
  withAuth, buildQuery, ok,
  readOnly, mutation, destructive,
  Auth,
} from '../utils/validate.js';
import { formatPluginSummary, formatGeneric } from '../utils/format.js';

const makeClient = (auth: Auth) =>
  new WordPressClient({ baseUrl: auth.siteUrl, username: auth.username, appPassword: auth.appPassword });

export function registerAdminTools(server: McpServer) {
  // ─── PLUGINS ──────────────────────────────────────────────────────────

  server.registerTool(
    'list_plugins',
    {
      title: 'List WordPress Plugins',
      description: 'List all installed plugins with their status. Requires administrator privileges.',
      annotations: readOnly,
      inputSchema: withAuth(
        z.object({
          status: z.enum(['active', 'inactive']).optional().describe('Filter by plugin status'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const params = input.status ? buildQuery({ status: input.status }) : '';
      const plugins = await wp.call(`/wp/v2/plugins${params}`);
      return ok((plugins as Record<string, unknown>[]).map(formatPluginSummary));
    },
  );

  server.registerTool(
    'get_plugin',
    {
      title: 'Get WordPress Plugin',
      description: 'Get details for a specific plugin by its slug (e.g. "akismet/akismet").',
      annotations: readOnly,
      inputSchema: withAuth(
        z.object({
          plugin: z.string().describe('Plugin slug in "directory/file" format (e.g. "akismet/akismet")'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const plugin = await wp.call(`/wp/v2/plugins/${input.plugin}`);
      return ok(formatPluginSummary(plugin as Record<string, unknown>));
    },
  );

  server.registerTool(
    'activate_plugin',
    {
      title: 'Activate WordPress Plugin',
      description: 'Activate an installed plugin. Requires administrator privileges.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          plugin: z.string().describe('Plugin slug in "directory/file" format (e.g. "akismet/akismet")'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const result = await wp.call(`/wp/v2/plugins/${input.plugin}`, 'POST', { status: 'active' });
      return ok(formatPluginSummary(result as Record<string, unknown>), `Plugin "${input.plugin}" activated.`);
    },
  );

  server.registerTool(
    'deactivate_plugin',
    {
      title: 'Deactivate WordPress Plugin',
      description: 'Deactivate a plugin. Requires administrator privileges.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          plugin: z.string().describe('Plugin slug in "directory/file" format'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const result = await wp.call(`/wp/v2/plugins/${input.plugin}`, 'POST', { status: 'inactive' });
      return ok(formatPluginSummary(result as Record<string, unknown>), `Plugin "${input.plugin}" deactivated.`);
    },
  );

  server.registerTool(
    'install_plugin',
    {
      title: 'Install WordPress Plugin',
      description: 'Install a plugin from the WordPress.org repository by slug. Requires administrator privileges.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          slug: z.string().describe('Plugin slug from wordpress.org (e.g. "akismet")'),
          activate: z.boolean().default(false).describe('Activate after install'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const result = await wp.call('/wp/v2/plugins', 'POST', {
        slug: input.slug,
        status: input.activate ? 'active' : 'inactive',
      });
      return ok(
        formatPluginSummary(result as Record<string, unknown>),
        `Plugin "${input.slug}" installed${input.activate ? ' and activated' : ''}.`,
      );
    },
  );

  server.registerTool(
    'delete_plugin',
    {
      title: 'Delete WordPress Plugin',
      description: 'Delete (uninstall) a plugin. Plugin must be deactivated first. IRREVERSIBLE.',
      annotations: destructive,
      inputSchema: withAuth(
        z.object({
          plugin: z.string().describe('Plugin slug in "directory/file" format'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const result = await wp.call(`/wp/v2/plugins/${input.plugin}`, 'DELETE');
      return ok(result, `Plugin "${input.plugin}" deleted.`);
    },
  );

  // ─── THEMES ───────────────────────────────────────────────────────────

  server.registerTool(
    'list_themes',
    {
      title: 'List WordPress Themes',
      description: 'List all installed themes with their status.',
      annotations: readOnly,
      inputSchema: withAuth(z.object({})),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const themes = await wp.call('/wp/v2/themes');
      return ok(themes);
    },
  );

  server.registerTool(
    'get_theme',
    {
      title: 'Get WordPress Theme',
      description: 'Get details for a specific theme by stylesheet name.',
      annotations: readOnly,
      inputSchema: withAuth(
        z.object({
          stylesheet: z.string().describe('Theme stylesheet/directory name (e.g. "twentytwentyfour")'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const theme = await wp.call(`/wp/v2/themes/${input.stylesheet}`);
      return ok(theme);
    },
  );

  server.registerTool(
    'activate_theme',
    {
      title: 'Activate WordPress Theme',
      description: 'Activate an installed theme. Requires administrator privileges.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          stylesheet: z.string().describe('Theme stylesheet/directory name to activate'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const result = await wp.call(`/wp/v2/themes/${input.stylesheet}`, 'POST', { status: 'active' });
      return ok(result, `Theme "${input.stylesheet}" activated.`);
    },
  );

  // ─── REVISIONS ────────────────────────────────────────────────────────

  server.registerTool(
    'list_post_revisions',
    {
      title: 'List Post Revisions',
      description: 'List all revisions for a post.',
      annotations: readOnly,
      inputSchema: withAuth(z.object({ post_id: id.describe('Post ID to get revisions for') })),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const revisions = await wp.call(`/wp/v2/posts/${input.post_id}/revisions`);
      return ok(revisions);
    },
  );

  server.registerTool(
    'list_page_revisions',
    {
      title: 'List Page Revisions',
      description: 'List all revisions for a page.',
      annotations: readOnly,
      inputSchema: withAuth(z.object({ page_id: id.describe('Page ID to get revisions for') })),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const revisions = await wp.call(`/wp/v2/pages/${input.page_id}/revisions`);
      return ok(revisions);
    },
  );

  server.registerTool(
    'get_revision',
    {
      title: 'Get Specific Revision',
      description: 'Get a specific revision by ID for a post or page.',
      annotations: readOnly,
      inputSchema: withAuth(
        z.object({
          parent_id: id.describe('Post or page ID'),
          revision_id: id.describe('Revision ID'),
          type: z.enum(['post', 'page']).default('post').describe('Parent content type'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const endpoint = input.type === 'page' ? 'pages' : 'posts';
      const revision = await wp.call(`/wp/v2/${endpoint}/${input.parent_id}/revisions/${input.revision_id}`);
      return ok(revision);
    },
  );

  // ─── NAVIGATION MENUS ────────────────────────────────────────────────

  server.registerTool(
    'list_menus',
    {
      title: 'List WordPress Navigation Menus',
      description: 'List all navigation menus (block theme nav menus via wp_navigation post type).',
      annotations: readOnly,
      inputSchema: withAuth(
        pagination.extend({
          status: z.enum(['publish', 'draft']).optional().describe('Filter by status'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...params } = input;
      const result = await wp.list(`/wp/v2/navigation${buildQuery(params)}`);
      return ok({ menus: result.data, total: result.total, totalPages: result.totalPages });
    },
  );

  server.registerTool(
    'get_menu',
    {
      title: 'Get WordPress Navigation Menu',
      description: 'Retrieve a single navigation menu by ID.',
      annotations: readOnly,
      inputSchema: withAuth(z.object({ id })),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const menu = await wp.call(`/wp/v2/navigation/${input.id}`);
      return ok(menu);
    },
  );

  server.registerTool(
    'create_menu',
    {
      title: 'Create WordPress Navigation Menu',
      description: 'Create a new navigation menu (block markup).',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          title: z.string().min(1).describe('Menu name'),
          content: z.string().default('').describe('Menu content as block markup (wp:navigation-link blocks)'),
          status: z.enum(['publish', 'draft']).default('publish').describe('Menu status'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...body } = input;
      const menu = await wp.call('/wp/v2/navigation', 'POST', body);
      return ok(menu, 'Navigation menu created successfully.');
    },
  );

  server.registerTool(
    'update_menu',
    {
      title: 'Update WordPress Navigation Menu',
      description: 'Update an existing navigation menu.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          id,
          title: z.string().optional().describe('New menu name'),
          content: z.string().optional().describe('New menu content as block markup'),
          status: z.enum(['publish', 'draft']).optional().describe('New status'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { id: menuId, auth, ...body } = input;
      const menu = await wp.call(`/wp/v2/navigation/${menuId}`, 'POST', body);
      return ok(menu, `Menu ${menuId} updated.`);
    },
  );

  server.registerTool(
    'delete_menu',
    {
      title: 'Delete WordPress Navigation Menu',
      description: 'Delete a navigation menu.',
      annotations: destructive,
      inputSchema: withAuth(
        z.object({
          id,
          force: z.boolean().default(false).describe('true = permanent delete, false = trash'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const result = await wp.call(`/wp/v2/navigation/${input.id}${buildQuery({ force: input.force })}`, 'DELETE');
      return ok(result, `Menu ${input.id} deleted.`);
    },
  );

  // ─── TEMPLATE PARTS / BLOCK PATTERNS ─────────────────────────────────

  server.registerTool(
    'list_template_parts',
    {
      title: 'List WordPress Template Parts',
      description: 'List template parts (header, footer, sidebar blocks).',
      annotations: readOnly,
      inputSchema: withAuth(
        z.object({
          area: z.enum(['header', 'footer', 'sidebar', 'uncategorized']).optional()
            .describe('Filter by template part area'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const params = input.area ? buildQuery({ area: input.area }) : '';
      const parts = await wp.call(`/wp/v2/template-parts${params}`);
      return ok(parts);
    },
  );

  server.registerTool(
    'list_block_patterns',
    {
      title: 'List WordPress Block Patterns',
      description: 'List registered block patterns.',
      annotations: readOnly,
      inputSchema: withAuth(z.object({})),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const patterns = await wp.call('/wp/v2/block-patterns/patterns');
      return ok(patterns);
    },
  );

  server.registerTool(
    'list_reusable_blocks',
    {
      title: 'List Reusable Blocks',
      description: 'List reusable blocks (synced patterns / wp_block post type).',
      annotations: readOnly,
      inputSchema: withAuth(pagination),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...params } = input;
      const result = await wp.list(`/wp/v2/blocks${buildQuery(params)}`);
      return ok({ blocks: result.data, total: result.total, totalPages: result.totalPages });
    },
  );
}
