import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WordPressClient } from '../client/wpClient.js';
import {
  id, pagination, status, orderDir, fieldsParam,
  withAuth, buildQuery, ok, err,
  readOnly, mutation, destructive,
  Auth,
} from '../utils/validate.js';
import {
  formatPostSummary, formatPostDetail,
  formatPageSummary, formatPageDetail,
  formatMediaSummary, formatMediaDetail,
} from '../utils/format.js';

const makeClient = (auth: Auth) =>
  new WordPressClient({ baseUrl: auth.siteUrl, username: auth.username, appPassword: auth.appPassword });

export function registerContentTools(server: McpServer) {
  // ─── POSTS ────────────────────────────────────────────────────────────

  server.registerTool(
    'list_posts',
    {
      title: 'List WordPress Posts',
      description: 'List and search posts with filtering by status, author, categories, tags, and keyword search. Returns paginated results with total counts.',
      annotations: readOnly,
      inputSchema: withAuth(
        pagination.extend({
          status: z.enum(['publish', 'draft', 'pending', 'private', 'future', 'trash', 'any']).default('publish')
            .describe('Filter by status. Use "any" for all statuses (requires auth).'),
          search: z.string().optional().describe('Search keyword in title and content'),
          author: z.number().int().optional().describe('Filter by author user ID'),
          categories: z.array(z.number().int()).optional().describe('Filter by category IDs'),
          tags: z.array(z.number().int()).optional().describe('Filter by tag IDs'),
          orderby: z.enum(['date', 'modified', 'title', 'id', 'relevance', 'slug']).default('date').describe('Sort field'),
          order: orderDir,
          _fields: fieldsParam,
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...params } = input;
      const result = await wp.list(`/wp/v2/posts${buildQuery(params)}`);
      return ok({
        posts: (result.data as Record<string, unknown>[]).map(formatPostSummary),
        total: result.total,
        totalPages: result.totalPages,
      });
    },
  );

  server.registerTool(
    'get_post',
    {
      title: 'Get WordPress Post',
      description: 'Retrieve a single post by ID with full content, metadata, categories, and tags.',
      annotations: readOnly,
      inputSchema: withAuth(
        z.object({
          id,
          context: z.enum(['view', 'edit']).default('view')
            .describe('"edit" returns raw content; "view" returns rendered HTML'),
          _fields: fieldsParam,
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const post = await wp.call(`/wp/v2/posts/${input.id}${buildQuery({ context: input.context, _fields: input._fields })}`);
      return ok(formatPostDetail(post as Record<string, unknown>));
    },
  );

  server.registerTool(
    'get_post_by_slug',
    {
      title: 'Get WordPress Post by Slug',
      description: 'Find a post by its URL slug (e.g. "hello-world"). Returns the first match.',
      annotations: readOnly,
      inputSchema: withAuth(
        z.object({
          slug: z.string().min(1).describe('Post URL slug (e.g. "hello-world")'),
          status: z.enum(['publish', 'draft', 'pending', 'private', 'any']).default('publish')
            .describe('Filter by status'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const result = await wp.list(`/wp/v2/posts${buildQuery({ slug: input.slug, status: input.status })}`);
      const posts = result.data as Record<string, unknown>[];
      if (posts.length === 0) return err(`No post found with slug "${input.slug}".`);
      return ok(formatPostDetail(posts[0]));
    },
  );

  server.registerTool(
    'create_post',
    {
      title: 'Create WordPress Post',
      description: 'Create a new post. Returns the created post with its assigned ID.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          title: z.string().min(1).describe('Post title'),
          content: z.string().default('').describe('Post body content (HTML or block markup)'),
          status: status.default('draft').describe('Publication status'),
          excerpt: z.string().optional().describe('Short summary'),
          author: z.number().int().optional().describe('Author user ID (defaults to authenticated user)'),
          categories: z.array(z.number().int()).optional().describe('Category IDs to assign'),
          tags: z.array(z.number().int()).optional().describe('Tag IDs to assign'),
          featured_media: z.number().int().optional().describe('Featured image media ID'),
          slug: z.string().optional().describe('URL slug (auto-generated from title if omitted)'),
          date: z.string().optional().describe('Publication date ISO 8601 (required for status "future")'),
          comment_status: z.enum(['open', 'closed']).optional().describe('Allow comments'),
          meta: z.record(z.unknown()).optional().describe('Custom meta fields (keys must be registered on the site)'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...body } = input;
      const post = await wp.call('/wp/v2/posts', 'POST', body);
      return ok(formatPostDetail(post as Record<string, unknown>), 'Post created successfully.');
    },
  );

  server.registerTool(
    'update_post',
    {
      title: 'Update WordPress Post',
      description: 'Update an existing post. Only include fields you want to change.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          id,
          title: z.string().optional().describe('New title'),
          content: z.string().optional().describe('New content'),
          status: status.optional().describe('New status'),
          excerpt: z.string().optional().describe('New excerpt'),
          author: z.number().int().optional().describe('New author user ID'),
          categories: z.array(z.number().int()).optional().describe('Replacement category IDs'),
          tags: z.array(z.number().int()).optional().describe('Replacement tag IDs'),
          featured_media: z.number().int().optional().describe('New featured image media ID (0 to remove)'),
          slug: z.string().optional().describe('New URL slug'),
          date: z.string().optional().describe('New publication date ISO 8601'),
          comment_status: z.enum(['open', 'closed']).optional().describe('Allow comments'),
          meta: z.record(z.unknown()).optional().describe('Meta fields to update'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { id: postId, auth, ...body } = input;
      const post = await wp.call(`/wp/v2/posts/${postId}`, 'POST', body);
      return ok(formatPostDetail(post as Record<string, unknown>), `Post ${postId} updated successfully.`);
    },
  );

  server.registerTool(
    'delete_post',
    {
      title: 'Delete WordPress Post',
      description: 'Move a post to trash or permanently delete it. Default is trash (recoverable).',
      annotations: destructive,
      inputSchema: withAuth(
        z.object({
          id,
          force: z.boolean().default(false).describe('true = permanent delete (IRREVERSIBLE), false = move to trash'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const result = await wp.call(`/wp/v2/posts/${input.id}${buildQuery({ force: input.force })}`, 'DELETE');
      const action = input.force ? 'permanently deleted' : 'moved to trash';
      return ok(result, `Post ${input.id} ${action}.`);
    },
  );

  server.registerTool(
    'bulk_update_posts',
    {
      title: 'Bulk Update WordPress Posts',
      description: 'Update multiple posts at once with the same field values. Returns results for each post.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          ids: z.array(z.number().int().positive()).min(1).max(50)
            .describe('Array of post IDs to update (max 50)'),
          title: z.string().optional().describe('New title for all posts'),
          status: status.optional().describe('New status for all posts'),
          categories: z.array(z.number().int()).optional().describe('Replacement category IDs for all posts'),
          tags: z.array(z.number().int()).optional().describe('Replacement tag IDs for all posts'),
          author: z.number().int().optional().describe('New author for all posts'),
          meta: z.record(z.unknown()).optional().describe('Meta fields to update on all posts'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ids, ...body } = input;
      const results = await Promise.allSettled(
        ids.map(pid => wp.call(`/wp/v2/posts/${pid}`, 'POST', body)),
      );
      const summary = results.map((r, i) => ({
        id: ids[i],
        success: r.status === 'fulfilled',
        ...(r.status === 'fulfilled'
          ? { title: formatPostSummary(r.value as Record<string, unknown>).title }
          : { error: (r.reason as Error).message }),
      }));
      const succeeded = summary.filter(s => s.success).length;
      return ok(summary, `Bulk update: ${succeeded}/${ids.length} posts updated.`);
    },
  );

  server.registerTool(
    'bulk_delete_posts',
    {
      title: 'Bulk Delete WordPress Posts',
      description: 'Delete multiple posts at once. Default moves to trash.',
      annotations: destructive,
      inputSchema: withAuth(
        z.object({
          ids: z.array(z.number().int().positive()).min(1).max(50)
            .describe('Array of post IDs to delete (max 50)'),
          force: z.boolean().default(false).describe('true = permanent delete, false = trash'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const results = await Promise.allSettled(
        input.ids.map(pid =>
          wp.call(`/wp/v2/posts/${pid}${buildQuery({ force: input.force })}`, 'DELETE'),
        ),
      );
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const action = input.force ? 'permanently deleted' : 'trashed';
      return ok(
        results.map((r, i) => ({
          id: input.ids[i],
          success: r.status === 'fulfilled',
          ...(r.status === 'rejected' ? { error: (r.reason as Error).message } : {}),
        })),
        `Bulk delete: ${succeeded}/${input.ids.length} posts ${action}.`,
      );
    },
  );

  // ─── PAGES ────────────────────────────────────────────────────────────

  server.registerTool(
    'list_pages',
    {
      title: 'List WordPress Pages',
      description: 'List and search pages with filtering and ordering.',
      annotations: readOnly,
      inputSchema: withAuth(
        pagination.extend({
          status: z.enum(['publish', 'draft', 'pending', 'private', 'future', 'trash', 'any']).default('publish')
            .describe('Filter by status'),
          search: z.string().optional().describe('Search keyword'),
          parent: z.number().int().optional().describe('Filter by parent page ID (0 for top-level only)'),
          orderby: z.enum(['date', 'modified', 'title', 'id', 'menu_order', 'slug']).default('menu_order').describe('Sort field'),
          order: z.enum(['asc', 'desc']).default('asc').describe('Sort direction'),
          _fields: fieldsParam,
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...params } = input;
      const result = await wp.list(`/wp/v2/pages${buildQuery(params)}`);
      return ok({
        pages: (result.data as Record<string, unknown>[]).map(formatPageSummary),
        total: result.total,
        totalPages: result.totalPages,
      });
    },
  );

  server.registerTool(
    'get_page',
    {
      title: 'Get WordPress Page',
      description: 'Retrieve a single page by ID with full content and metadata.',
      annotations: readOnly,
      inputSchema: withAuth(
        z.object({
          id,
          context: z.enum(['view', 'edit']).default('view')
            .describe('"edit" returns raw content; "view" returns rendered HTML'),
          _fields: fieldsParam,
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const page = await wp.call(`/wp/v2/pages/${input.id}${buildQuery({ context: input.context, _fields: input._fields })}`);
      return ok(formatPageDetail(page as Record<string, unknown>));
    },
  );

  server.registerTool(
    'get_page_by_slug',
    {
      title: 'Get WordPress Page by Slug',
      description: 'Find a page by its URL slug (e.g. "about", "contact"). Returns the first match.',
      annotations: readOnly,
      inputSchema: withAuth(
        z.object({
          slug: z.string().min(1).describe('Page URL slug (e.g. "about")'),
          status: z.enum(['publish', 'draft', 'pending', 'private', 'any']).default('publish')
            .describe('Filter by status'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const result = await wp.list(`/wp/v2/pages${buildQuery({ slug: input.slug, status: input.status })}`);
      const pages = result.data as Record<string, unknown>[];
      if (pages.length === 0) return err(`No page found with slug "${input.slug}".`);
      return ok(formatPageDetail(pages[0]));
    },
  );

  server.registerTool(
    'create_page',
    {
      title: 'Create WordPress Page',
      description: 'Create a new page. Supports parent pages, templates, and menu ordering.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          title: z.string().min(1).describe('Page title'),
          content: z.string().default('').describe('Page body content (HTML or block markup)'),
          status: status.default('draft').describe('Publication status'),
          excerpt: z.string().optional().describe('Short summary'),
          author: z.number().int().optional().describe('Author user ID'),
          parent: z.number().int().min(0).optional().describe('Parent page ID (0 for top-level)'),
          menu_order: z.number().int().optional().describe('Menu position (lower = first)'),
          template: z.string().optional().describe('Page template filename (must exist in theme)'),
          featured_media: z.number().int().optional().describe('Featured image media ID'),
          slug: z.string().optional().describe('URL slug'),
          comment_status: z.enum(['open', 'closed']).optional().describe('Allow comments'),
          meta: z.record(z.unknown()).optional().describe('Custom meta fields'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...body } = input;
      const page = await wp.call('/wp/v2/pages', 'POST', body);
      return ok(formatPageDetail(page as Record<string, unknown>), 'Page created successfully.');
    },
  );

  server.registerTool(
    'update_page',
    {
      title: 'Update WordPress Page',
      description: 'Update an existing page. Only include fields you want to change.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          id,
          title: z.string().optional().describe('New title'),
          content: z.string().optional().describe('New content'),
          status: status.optional().describe('New status'),
          excerpt: z.string().optional().describe('New excerpt'),
          author: z.number().int().optional().describe('New author user ID'),
          parent: z.number().int().min(0).optional().describe('New parent page ID'),
          menu_order: z.number().int().optional().describe('New menu position'),
          template: z.string().optional().describe('New page template'),
          featured_media: z.number().int().optional().describe('New featured image (0 to remove)'),
          slug: z.string().optional().describe('New URL slug'),
          comment_status: z.enum(['open', 'closed']).optional().describe('Allow comments'),
          meta: z.record(z.unknown()).optional().describe('Meta fields to update'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { id: pageId, auth, ...body } = input;
      const page = await wp.call(`/wp/v2/pages/${pageId}`, 'POST', body);
      return ok(formatPageDetail(page as Record<string, unknown>), `Page ${pageId} updated successfully.`);
    },
  );

  server.registerTool(
    'delete_page',
    {
      title: 'Delete WordPress Page',
      description: 'Move a page to trash or permanently delete it.',
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
      const result = await wp.call(`/wp/v2/pages/${input.id}${buildQuery({ force: input.force })}`, 'DELETE');
      const action = input.force ? 'permanently deleted' : 'moved to trash';
      return ok(result, `Page ${input.id} ${action}.`);
    },
  );

  // ─── MEDIA ────────────────────────────────────────────────────────────

  server.registerTool(
    'list_media',
    {
      title: 'List WordPress Media',
      description: 'List media library items with filtering by type, MIME type, and search.',
      annotations: readOnly,
      inputSchema: withAuth(
        pagination.extend({
          media_type: z.enum(['image', 'video', 'audio', 'application']).optional().describe('Filter by media type'),
          mime_type: z.string().optional().describe('Filter by MIME type (e.g. "image/jpeg")'),
          search: z.string().optional().describe('Search by filename or title'),
          parent: z.number().int().optional().describe('Filter by attached post/page ID (0 for unattached)'),
          orderby: z.enum(['date', 'modified', 'title', 'id']).default('date').describe('Sort field'),
          order: orderDir,
          _fields: fieldsParam,
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ...params } = input;
      const result = await wp.list(`/wp/v2/media${buildQuery(params)}`);
      return ok({
        media: (result.data as Record<string, unknown>[]).map(formatMediaSummary),
        total: result.total,
        totalPages: result.totalPages,
      });
    },
  );

  server.registerTool(
    'get_media',
    {
      title: 'Get WordPress Media Item',
      description: 'Retrieve a single media item by ID with URLs, sizes, and all metadata.',
      annotations: readOnly,
      inputSchema: withAuth(z.object({ id, _fields: fieldsParam })),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const media = await wp.call(`/wp/v2/media/${input.id}${buildQuery({ _fields: input._fields })}`);
      return ok(formatMediaDetail(media as Record<string, unknown>));
    },
  );

  server.registerTool(
    'upload_media',
    {
      title: 'Upload Media to WordPress',
      description: 'Download a file from a public URL and upload it to the WordPress media library. Returns the new media item.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          url: z.string().url().describe('Public URL of the file to download and upload'),
          filename: z.string().optional().describe('Override filename (including extension)'),
          title: z.string().optional().describe('Media title'),
          alt_text: z.string().optional().describe('Alt text for accessibility'),
          caption: z.string().optional().describe('Caption displayed below media'),
          description: z.string().optional().describe('Long description'),
          post: z.number().int().optional().describe('Post/page ID to attach media to'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);

      const response = await fetch(input.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch media from URL: HTTP ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('Content-Type') ?? 'application/octet-stream';
      const mimeType = contentType.split(';')[0].trim();
      const urlPath = new URL(input.url).pathname;
      const urlFilename = urlPath.split('/').pop() || 'upload';
      const filename = input.filename ?? urlFilename;

      const buffer = Buffer.from(await response.arrayBuffer());
      let media = await wp.uploadBinary('/wp/v2/media', buffer, filename, mimeType);

      const metaUpdate: Record<string, unknown> = {};
      if (input.title) metaUpdate.title = input.title;
      if (input.alt_text) metaUpdate.alt_text = input.alt_text;
      if (input.caption) metaUpdate.caption = input.caption;
      if (input.description) metaUpdate.description = input.description;
      if (input.post) metaUpdate.post = input.post;

      if (Object.keys(metaUpdate).length > 0) {
        media = await wp.call(`/wp/v2/media/${(media as any).id}`, 'POST', metaUpdate);
      }

      return ok(formatMediaDetail(media as Record<string, unknown>), 'Media uploaded successfully.');
    },
  );

  server.registerTool(
    'update_media',
    {
      title: 'Update WordPress Media Metadata',
      description: 'Update metadata for an existing media item. Does not replace the file.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          id,
          title: z.string().optional().describe('New title'),
          alt_text: z.string().optional().describe('New alt text'),
          caption: z.string().optional().describe('New caption'),
          description: z.string().optional().describe('New description'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { id: mediaId, auth, ...body } = input;
      const media = await wp.call(`/wp/v2/media/${mediaId}`, 'POST', body);
      return ok(formatMediaDetail(media as Record<string, unknown>), `Media ${mediaId} updated.`);
    },
  );

  server.registerTool(
    'delete_media',
    {
      title: 'Delete WordPress Media',
      description: 'Permanently delete a media item. This is IRREVERSIBLE and removes the file from disk.',
      annotations: destructive,
      inputSchema: withAuth(z.object({ id })),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const result = await wp.call(`/wp/v2/media/${input.id}?force=true`, 'DELETE');
      return ok(result, `Media ${input.id} permanently deleted.`);
    },
  );

  server.registerTool(
    'bulk_update_media',
    {
      title: 'Bulk Update Media Metadata',
      description: 'Update metadata for multiple media items at once.',
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          ids: z.array(z.number().int().positive()).min(1).max(50)
            .describe('Array of media IDs to update (max 50)'),
          alt_text: z.string().optional().describe('New alt text for all items'),
          caption: z.string().optional().describe('New caption for all items'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const { auth, ids, ...body } = input;
      const results = await Promise.allSettled(
        ids.map(mid => wp.call(`/wp/v2/media/${mid}`, 'POST', body)),
      );
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      return ok(
        results.map((r, i) => ({
          id: ids[i],
          success: r.status === 'fulfilled',
          ...(r.status === 'rejected' ? { error: (r.reason as Error).message } : {}),
        })),
        `Bulk update: ${succeeded}/${ids.length} media items updated.`,
      );
    },
  );
}
