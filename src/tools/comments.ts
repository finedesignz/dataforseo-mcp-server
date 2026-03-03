import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WordPressClient } from '../client/wpClient.js';
import {
  id, pagination, orderDir, fieldsParam,
  withAuth, buildQuery, ok, resolveAuth,
  readOnly, mutation, destructive,
} from '../utils/validate.js';
import { formatCommentSummary, formatCommentDetail } from '../utils/format.js';

const makeClient = (rawAuth?: { siteUrl?: string; username?: string; appPassword?: string }) => {
  const a = resolveAuth(rawAuth);
  return new WordPressClient({ baseUrl: a.siteUrl, username: a.username, appPassword: a.appPassword });
};

export function registerCommentTools(server: McpServer) {
  server.registerTool(
    'list_comments',
    {
      title: 'List WordPress Comments',
      description: 'List comments with filtering by post, status, author, and search.',
      annotations: readOnly,
      inputSchema: withAuth(
        pagination.extend({
          post: z.number().int().optional().describe('Filter by post ID'),
          status: z.enum(['hold', 'approve', 'spam', 'trash', 'all']).optional().describe('Filter by comment status'),
          search: z.string().optional().describe('Search comment content'),
          author: z.number().int().optional().describe('Filter by author user ID'),
          author_email: z.string().optional().describe('Filter by author email'),
          orderby: z.enum(['date', 'date_gmt', 'id']).default('date').describe('Sort field'),
          order: orderDir,
          _fields: fieldsParam,
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...params } = input;
      const result = await wp.list(`/wp/v2/comments${buildQuery(params)}`);
      return ok({
        comments: (result.data as Record<string, unknown>[]).map(formatCommentSummary),
        total: result.total,
        totalPages: result.totalPages,
      });
    },
  );

  server.registerTool(
    'get_comment',
    {
      title: 'Get WordPress Comment',
      description: 'Retrieve a single comment by ID.',
      annotations: readOnly,
      inputSchema: withAuth(z.object({ id, _fields: fieldsParam })),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const comment = await wp.call(`/wp/v2/comments/${input.id}${buildQuery({ _fields: input._fields })}`);
      return ok(formatCommentDetail(comment as Record<string, unknown>));
    },
  );

  server.registerTool(
    'create_comment',
    {
      title: 'Create WordPress Comment',
      description: 'Create a new comment on a post.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          post: z.number().int().positive().describe('Post ID to comment on'),
          content: z.string().min(1).describe('Comment content (HTML allowed)'),
          parent: z.number().int().optional().describe('Parent comment ID for replies'),
          author: z.number().int().optional().describe('Author user ID (for logged-in users)'),
          author_name: z.string().optional().describe('Author name (for anonymous comments)'),
          author_email: z.string().email().optional().describe('Author email (for anonymous comments)'),
          author_url: z.string().optional().describe('Author website URL'),
          status: z.enum(['hold', 'approve']).optional().describe('Comment status (default: site default)'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...body } = input;
      const comment = await wp.call('/wp/v2/comments', 'POST', body);
      return ok(formatCommentDetail(comment as Record<string, unknown>), 'Comment created successfully.');
    },
  );

  server.registerTool(
    'update_comment',
    {
      title: 'Update WordPress Comment',
      description: 'Update a comment content or status. Use this to approve, spam, or trash comments.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          id,
          content: z.string().optional().describe('New comment content'),
          status: z.enum(['hold', 'approve', 'spam', 'trash']).optional()
            .describe('New status: "approve" to publish, "hold" for moderation, "spam" or "trash" to remove'),
          author_name: z.string().optional().describe('New author name'),
          author_email: z.string().email().optional().describe('New author email'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { id: commentId, auth, ...body } = input;
      const comment = await wp.call(`/wp/v2/comments/${commentId}`, 'POST', body);
      return ok(formatCommentDetail(comment as Record<string, unknown>), `Comment ${commentId} updated.`);
    },
  );

  server.registerTool(
    'delete_comment',
    {
      title: 'Delete WordPress Comment',
      description: 'Move a comment to trash or permanently delete it.',
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
      const result = await wp.call(`/wp/v2/comments/${input.id}${buildQuery({ force: input.force })}`, 'DELETE');
      const action = input.force ? 'permanently deleted' : 'moved to trash';
      return ok(result, `Comment ${input.id} ${action}.`);
    },
  );
}
