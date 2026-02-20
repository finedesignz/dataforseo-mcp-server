import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WordPressClient } from '../client/wpClient.js';
import {
  id, pagination, slug, fieldsParam,
  withAuth, buildQuery, ok,
  readOnly, mutation, destructive,
  Auth,
} from '../utils/validate.js';
import { formatTermSummary } from '../utils/format.js';

const makeClient = (auth: Auth) =>
  new WordPressClient({ baseUrl: auth.siteUrl, username: auth.username, appPassword: auth.appPassword });

export function registerTaxonomyTools(server: McpServer) {
  // ─── CATEGORIES ───────────────────────────────────────────────────────

  server.registerTool(
    'list_categories',
    {
      title: 'List WordPress Categories',
      description: 'List categories with optional search, parent filtering, and ordering.',
      annotations: readOnly,
      inputSchema: withAuth(
        pagination.extend({
          search: z.string().optional().describe('Search by category name'),
          parent: z.number().int().optional().describe('Filter by parent category ID (0 for top-level)'),
          orderby: z.enum(['id', 'name', 'slug', 'count']).default('name').describe('Sort field'),
          order: z.enum(['asc', 'desc']).default('asc').describe('Sort direction'),
          hide_empty: z.boolean().optional().describe('Hide categories with no posts'),
          _fields: fieldsParam,
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...params } = input;
      const result = await wp.list(`/wp/v2/categories${buildQuery(params)}`);
      return ok({
        categories: (result.data as Record<string, unknown>[]).map(formatTermSummary),
        total: result.total,
        totalPages: result.totalPages,
      });
    },
  );

  server.registerTool(
    'get_category',
    {
      title: 'Get WordPress Category',
      description: 'Retrieve a single category by ID.',
      annotations: readOnly,
      inputSchema: withAuth(z.object({ id, _fields: fieldsParam })),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const cat = await wp.call(`/wp/v2/categories/${input.id}${buildQuery({ _fields: input._fields })}`);
      return ok(formatTermSummary(cat as Record<string, unknown>));
    },
  );

  server.registerTool(
    'create_category',
    {
      title: 'Create WordPress Category',
      description: 'Create a new category. Supports hierarchical parent categories.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          name: z.string().min(1).describe('Category name'),
          slug: slug.optional().describe('URL slug (auto-generated if omitted)'),
          description: z.string().optional().describe('Category description'),
          parent: z.number().int().min(0).optional().describe('Parent category ID (0 for top-level)'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...body } = input;
      const cat = await wp.call('/wp/v2/categories', 'POST', body);
      return ok(formatTermSummary(cat as Record<string, unknown>), 'Category created successfully.');
    },
  );

  server.registerTool(
    'update_category',
    {
      title: 'Update WordPress Category',
      description: 'Update an existing category.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          id,
          name: z.string().optional().describe('New name'),
          slug: slug.optional().describe('New slug'),
          description: z.string().optional().describe('New description'),
          parent: z.number().int().min(0).optional().describe('New parent category ID'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { id: termId, auth, ...body } = input;
      const cat = await wp.call(`/wp/v2/categories/${termId}`, 'POST', body);
      return ok(formatTermSummary(cat as Record<string, unknown>), `Category ${termId} updated.`);
    },
  );

  server.registerTool(
    'delete_category',
    {
      title: 'Delete WordPress Category',
      description: 'Permanently delete a category. Posts in this category are NOT deleted.',
      annotations: destructive,
      inputSchema: withAuth(z.object({ id })),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const result = await wp.call(`/wp/v2/categories/${input.id}?force=true`, 'DELETE');
      return ok(result, `Category ${input.id} deleted.`);
    },
  );

  // ─── TAGS ─────────────────────────────────────────────────────────────

  server.registerTool(
    'list_tags',
    {
      title: 'List WordPress Tags',
      description: 'List tags with optional search and ordering.',
      annotations: readOnly,
      inputSchema: withAuth(
        pagination.extend({
          search: z.string().optional().describe('Search by tag name'),
          orderby: z.enum(['id', 'name', 'slug', 'count']).default('name').describe('Sort field'),
          order: z.enum(['asc', 'desc']).default('asc').describe('Sort direction'),
          hide_empty: z.boolean().optional().describe('Hide tags with no posts'),
          _fields: fieldsParam,
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...params } = input;
      const result = await wp.list(`/wp/v2/tags${buildQuery(params)}`);
      return ok({
        tags: (result.data as Record<string, unknown>[]).map(formatTermSummary),
        total: result.total,
        totalPages: result.totalPages,
      });
    },
  );

  server.registerTool(
    'get_tag',
    {
      title: 'Get WordPress Tag',
      description: 'Retrieve a single tag by ID.',
      annotations: readOnly,
      inputSchema: withAuth(z.object({ id, _fields: fieldsParam })),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const tag = await wp.call(`/wp/v2/tags/${input.id}${buildQuery({ _fields: input._fields })}`);
      return ok(formatTermSummary(tag as Record<string, unknown>));
    },
  );

  server.registerTool(
    'create_tag',
    {
      title: 'Create WordPress Tag',
      description: 'Create a new tag.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          name: z.string().min(1).describe('Tag name'),
          slug: slug.optional().describe('URL slug'),
          description: z.string().optional().describe('Tag description'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...body } = input;
      const tag = await wp.call('/wp/v2/tags', 'POST', body);
      return ok(formatTermSummary(tag as Record<string, unknown>), 'Tag created successfully.');
    },
  );

  server.registerTool(
    'update_tag',
    {
      title: 'Update WordPress Tag',
      description: 'Update an existing tag.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          id,
          name: z.string().optional().describe('New name'),
          slug: slug.optional().describe('New slug'),
          description: z.string().optional().describe('New description'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { id: termId, auth, ...body } = input;
      const tag = await wp.call(`/wp/v2/tags/${termId}`, 'POST', body);
      return ok(formatTermSummary(tag as Record<string, unknown>), `Tag ${termId} updated.`);
    },
  );

  server.registerTool(
    'delete_tag',
    {
      title: 'Delete WordPress Tag',
      description: 'Permanently delete a tag. Posts with this tag are NOT deleted.',
      annotations: destructive,
      inputSchema: withAuth(z.object({ id })),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const result = await wp.call(`/wp/v2/tags/${input.id}?force=true`, 'DELETE');
      return ok(result, `Tag ${input.id} deleted.`);
    },
  );
}
