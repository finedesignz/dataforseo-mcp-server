import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WordPressClient } from '../client/wpClient.js';
import {
  id, pagination, fieldsParam,
  withAuth, buildQuery, ok,
  readOnly, mutation, destructive,
  Auth,
} from '../utils/validate.js';
import { formatUserSummary, formatUserDetail } from '../utils/format.js';

const makeClient = (auth: Auth) =>
  new WordPressClient({ baseUrl: auth.siteUrl, username: auth.username, appPassword: auth.appPassword });

export function registerUserTools(server: McpServer) {
  server.registerTool(
    'list_users',
    {
      title: 'List WordPress Users',
      description: 'List users with optional filtering by role, search, and ordering.',
      annotations: readOnly,
      inputSchema: withAuth(
        pagination.extend({
          roles: z.array(z.string()).optional()
            .describe('Filter by roles (e.g. ["administrator", "editor", "author", "contributor", "subscriber"])'),
          search: z.string().optional().describe('Search by username, name, or email'),
          orderby: z.enum(['id', 'name', 'slug', 'email', 'registered_date']).default('name').describe('Sort field'),
          order: z.enum(['asc', 'desc']).default('asc').describe('Sort direction'),
          who: z.enum(['authors']).optional().describe('Restrict to users who have published posts'),
          _fields: fieldsParam,
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...params } = input;
      const result = await wp.list(`/wp/v2/users${buildQuery(params)}`);
      return ok({
        users: (result.data as Record<string, unknown>[]).map(formatUserSummary),
        total: result.total,
        totalPages: result.totalPages,
      });
    },
  );

  server.registerTool(
    'get_user',
    {
      title: 'Get WordPress User',
      description: 'Retrieve a single user by ID, or use id=0 to get the authenticated user.',
      annotations: readOnly,
      inputSchema: withAuth(
        z.object({
          id: z.number().int().min(0).describe('User ID, or 0 to get "me" (authenticated user)'),
          _fields: fieldsParam,
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const path = input.id === 0 ? '/wp/v2/users/me' : `/wp/v2/users/${input.id}`;
      const user = await wp.call(`${path}${buildQuery({ _fields: input._fields })}`);
      return ok(formatUserDetail(user as Record<string, unknown>));
    },
  );

  server.registerTool(
    'create_user',
    {
      title: 'Create WordPress User',
      description: 'Create a new user. Requires administrator privileges.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          username: z.string().min(1).describe('Login username (must be unique, cannot be changed later)'),
          email: z.string().email().describe('Email address (must be unique)'),
          password: z.string().min(6).describe('Password (min 6 characters)'),
          name: z.string().optional().describe('Display name'),
          first_name: z.string().optional().describe('First name'),
          last_name: z.string().optional().describe('Last name'),
          url: z.string().optional().describe('User website URL'),
          description: z.string().optional().describe('Biographical info'),
          roles: z.array(z.string()).optional().describe('Roles to assign (e.g. ["editor"]). Defaults to subscriber.'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...body } = input;
      const user = await wp.call('/wp/v2/users', 'POST', body);
      return ok(formatUserDetail(user as Record<string, unknown>), 'User created successfully.');
    },
  );

  server.registerTool(
    'update_user',
    {
      title: 'Update WordPress User',
      description: 'Update an existing user profile. Only include fields to change.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          id,
          name: z.string().optional().describe('New display name'),
          first_name: z.string().optional().describe('New first name'),
          last_name: z.string().optional().describe('New last name'),
          email: z.string().email().optional().describe('New email'),
          url: z.string().optional().describe('New website URL'),
          description: z.string().optional().describe('New bio'),
          password: z.string().optional().describe('New password'),
          roles: z.array(z.string()).optional().describe('New roles'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { id: userId, auth, ...body } = input;
      const user = await wp.call(`/wp/v2/users/${userId}`, 'POST', body);
      return ok(formatUserDetail(user as Record<string, unknown>), `User ${userId} updated successfully.`);
    },
  );

  server.registerTool(
    'delete_user',
    {
      title: 'Delete WordPress User',
      description: 'Permanently delete a user. Requires administrator privileges. All content is reassigned to the specified user.',
      annotations: destructive,
      inputSchema: withAuth(
        z.object({
          id,
          reassign: z.number().int().positive()
            .describe('User ID to reassign all content (posts, pages) to before deleting. REQUIRED.'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const result = await wp.call(
        `/wp/v2/users/${input.id}${buildQuery({ force: true, reassign: input.reassign })}`,
        'DELETE',
      );
      return ok(result, `User ${input.id} permanently deleted. Content reassigned to user ${input.reassign}.`);
    },
  );
}
