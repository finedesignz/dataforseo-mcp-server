import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WordPressClient } from '../client/wpClient.js';
import {
  id, pagination, status, orderDir, fieldsParam,
  withAuth, buildQuery, ok, err,
  readOnly, mutation, destructive,
  Auth,
} from '../utils/validate.js';
import { formatGeneric, stripHtml, truncate } from '../utils/format.js';

const makeClient = (auth: Auth) =>
  new WordPressClient({ baseUrl: auth.siteUrl, username: auth.username, appPassword: auth.appPassword });

export function registerCustomPostTypeTools(server: McpServer) {
  // ─── DISCOVER POST TYPES ─────────────────────────────────────────────

  server.registerTool(
    'list_post_types',
    {
      title: 'List WordPress Post Types',
      description: 'List all registered post types (including custom ones like WooCommerce products, portfolio, etc.). Returns REST API base paths for each type.',
      annotations: readOnly,
      inputSchema: withAuth(z.object({})),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const types = await wp.call<Record<string, unknown>>('/wp/v2/types');
      // Format each type to show essential info
      const formatted: Record<string, unknown> = {};
      for (const [slug, info] of Object.entries(types)) {
        const t = info as Record<string, unknown>;
        formatted[slug] = {
          name: t.name,
          slug: t.slug,
          description: t.description,
          hierarchical: t.hierarchical,
          rest_base: t.rest_base,
          rest_namespace: t.rest_namespace,
        };
      }
      return ok(formatted);
    },
  );

  // ─── GENERIC CPT CRUD ────────────────────────────────────────────────

  server.registerTool(
    'list_custom_posts',
    {
      title: 'List Custom Post Type Items',
      description: 'List items of any custom post type by specifying its REST base (e.g. "products" for WooCommerce, "portfolio" for portfolio CPTs). Use list_post_types first to discover available types and their REST bases.',
      annotations: readOnly,
      inputSchema: withAuth(
        pagination.extend({
          rest_base: z.string().min(1).describe('REST API base for the post type (e.g. "products", "portfolio", "testimonials"). Find this via list_post_types.'),
          status: z.enum(['publish', 'draft', 'pending', 'private', 'future', 'trash', 'any']).default('publish')
            .describe('Filter by status'),
          search: z.string().optional().describe('Search keyword'),
          orderby: z.enum(['date', 'modified', 'title', 'id', 'slug']).default('date').describe('Sort field'),
          order: orderDir,
          _fields: fieldsParam,
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, rest_base, ...params } = input;
      const result = await wp.list(`/wp/v2/${rest_base}${buildQuery(params)}`);
      return ok({
        items: (result.data as Record<string, unknown>[]).map(item => {
          const title = item.title;
          return {
            id: item.id,
            title: typeof title === 'object' && title !== null && 'rendered' in title
              ? stripHtml(String((title as Record<string, unknown>).rendered))
              : title,
            status: item.status,
            slug: item.slug,
            date: item.date,
            modified: item.modified,
            link: item.link,
            type: item.type,
          };
        }),
        total: result.total,
        totalPages: result.totalPages,
      });
    },
  );

  server.registerTool(
    'get_custom_post',
    {
      title: 'Get Custom Post Type Item',
      description: 'Retrieve a single custom post type item by ID and REST base.',
      annotations: readOnly,
      inputSchema: withAuth(
        z.object({
          rest_base: z.string().min(1).describe('REST API base for the post type'),
          id,
          context: z.enum(['view', 'edit']).default('view').describe('Response context'),
          _fields: fieldsParam,
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const item = await wp.call(
        `/wp/v2/${input.rest_base}/${input.id}${buildQuery({ context: input.context, _fields: input._fields })}`,
      );
      return ok(formatGeneric(item as Record<string, unknown>));
    },
  );

  server.registerTool(
    'create_custom_post',
    {
      title: 'Create Custom Post Type Item',
      description: 'Create a new item of any custom post type. The fields accepted depend on the post type registration.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          rest_base: z.string().min(1).describe('REST API base for the post type'),
          title: z.string().optional().describe('Item title'),
          content: z.string().optional().describe('Item content'),
          status: status.default('draft').describe('Publication status'),
          slug: z.string().optional().describe('URL slug'),
          meta: z.record(z.unknown()).optional().describe('Custom meta fields'),
          fields: z.record(z.unknown()).optional()
            .describe('Additional fields specific to this post type (passed directly to the API)'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, rest_base, fields: extra, ...body } = input;
      const payload = { ...body, ...extra };
      const item = await wp.call(`/wp/v2/${rest_base}`, 'POST', payload);
      return ok(formatGeneric(item as Record<string, unknown>), 'Custom post created successfully.');
    },
  );

  server.registerTool(
    'update_custom_post',
    {
      title: 'Update Custom Post Type Item',
      description: 'Update an existing custom post type item. Only include fields to change.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          rest_base: z.string().min(1).describe('REST API base for the post type'),
          id,
          title: z.string().optional().describe('New title'),
          content: z.string().optional().describe('New content'),
          status: status.optional().describe('New status'),
          slug: z.string().optional().describe('New slug'),
          meta: z.record(z.unknown()).optional().describe('Meta fields to update'),
          fields: z.record(z.unknown()).optional()
            .describe('Additional type-specific fields'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, rest_base, id: itemId, fields: extra, ...body } = input;
      const payload = { ...body, ...extra };
      const item = await wp.call(`/wp/v2/${rest_base}/${itemId}`, 'POST', payload);
      return ok(formatGeneric(item as Record<string, unknown>), `Custom post ${itemId} updated.`);
    },
  );

  server.registerTool(
    'delete_custom_post',
    {
      title: 'Delete Custom Post Type Item',
      description: 'Delete a custom post type item. Behavior (trash vs permanent) depends on the post type.',
      annotations: destructive,
      inputSchema: withAuth(
        z.object({
          rest_base: z.string().min(1).describe('REST API base for the post type'),
          id,
          force: z.boolean().default(false).describe('true = permanent delete, false = trash (if supported)'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const result = await wp.call(
        `/wp/v2/${input.rest_base}/${input.id}${buildQuery({ force: input.force })}`,
        'DELETE',
      );
      return ok(result, `Custom post ${input.id} deleted.`);
    },
  );
}
