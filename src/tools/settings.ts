import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WordPressClient } from '../client/wpClient.js';
import {
  pagination, fieldsParam,
  withAuth, buildQuery, ok,
  readOnly, mutation,
  Auth,
} from '../utils/validate.js';

const makeClient = (auth: Auth) =>
  new WordPressClient({ baseUrl: auth.siteUrl, username: auth.username, appPassword: auth.appPassword });

export function registerSettingsTools(server: McpServer) {
  server.registerTool(
    'test_connection',
    {
      title: 'Test WordPress Connection',
      description: 'Verify that the WordPress credentials are valid by pinging the site. Returns site info and authenticated user details.',
      annotations: readOnly,
      inputSchema: withAuth(z.object({})),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      // Fetch site index for basic info
      const siteInfo = await wp.call<Record<string, unknown>>('/wp/v2');
      // Fetch current user to validate auth
      const user = await wp.call<Record<string, unknown>>('/wp/v2/users/me');
      return ok({
        connected: true,
        site: {
          name: siteInfo.name,
          description: siteInfo.description,
          url: siteInfo.url,
          namespaces: siteInfo.namespaces,
        },
        user: {
          id: user.id,
          username: user.username ?? user.slug,
          name: user.name,
          roles: user.roles,
        },
      }, 'Connection successful.');
    },
  );

  server.registerTool(
    'get_settings',
    {
      title: 'Get WordPress Site Settings',
      description: 'Retrieve site settings: title, tagline, URL, timezone, date format, etc. Requires administrator privileges.',
      annotations: readOnly,
      inputSchema: withAuth(z.object({})),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const settings = await wp.call('/wp/v2/settings');
      return ok(settings);
    },
  );

  server.registerTool(
    'update_settings',
    {
      title: 'Update WordPress Site Settings',
      description: 'Update site settings. Only include fields you want to change. Requires administrator privileges.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          title: z.string().optional().describe('Site title'),
          description: z.string().optional().describe('Site tagline'),
          url: z.string().url().optional().describe('Site URL'),
          timezone: z.string().optional().describe('Timezone string (e.g. "America/New_York")'),
          date_format: z.string().optional().describe('PHP date format string'),
          time_format: z.string().optional().describe('PHP time format string'),
          posts_per_page: z.number().int().positive().optional().describe('Posts per page on blog'),
          default_comment_status: z.enum(['open', 'closed']).optional().describe('Default comment status for new posts'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...body } = input;
      const settings = await wp.call('/wp/v2/settings', 'POST', body);
      return ok(settings, 'Settings updated successfully.');
    },
  );

  server.registerTool(
    'search_content',
    {
      title: 'Search WordPress Content',
      description: 'Search across all WordPress content types (posts, pages, etc.) in one call.',
      annotations: readOnly,
      inputSchema: withAuth(
        pagination.extend({
          search: z.string().min(1).describe('Search query string'),
          type: z.enum(['post', 'term', 'post-format']).optional().describe('Restrict to content type'),
          subtype: z.string().optional().describe('Restrict to subtype (e.g. "post", "page", "category")'),
          _fields: fieldsParam,
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...params } = input;
      const result = await wp.list(`/wp/v2/search${buildQuery(params)}`);
      return ok({ results: result.data, total: result.total, totalPages: result.totalPages });
    },
  );
}
