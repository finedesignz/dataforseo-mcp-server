import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WordPressClient } from '../client/wpClient.js';
import { id, withAuth, ok, err, resolveAuth, readOnly, mutation } from '../utils/validate.js';

const makeClient = (rawAuth?: { siteUrl?: string; username?: string; appPassword?: string }) => {
  const a = resolveAuth(rawAuth);
  return new WordPressClient({ baseUrl: a.siteUrl, username: a.username, appPassword: a.appPassword });
};

const PREREQUISITE = [
  'PREREQUISITE: The WordPress site must register _elementor_data as a REST-accessible meta field.',
  'Add this to functions.php or a custom plugin:',
  '',
  "register_post_meta('page', '_elementor_data', [",
  "  'show_in_rest'  => true,",
  "  'single'        => true,",
  "  'type'          => 'string',",
  "  'auth_callback' => function() { return current_user_can('edit_posts'); },",
  ']);',
  '',
  'Do the same for "post" if you use Elementor on posts.',
].join('\n');

export function registerElementorTools(server: McpServer) {
  server.registerTool(
    'get_elementor_data',
    {
      title: 'Get Elementor Page Data',
      description: `Read the Elementor builder data (JSON widget tree) for a post or page. Returns the raw _elementor_data meta.\n\n${PREREQUISITE}`,
      annotations: readOnly,
      inputSchema: withAuth(
        z.object({
          id: id.describe('Post or page ID'),
          type: z.enum(['post', 'page']).default('page').describe('Content type'),
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
      const elementorData = meta['_elementor_data'];

      if (elementorData === undefined) {
        return err(
          `_elementor_data meta is not accessible for ${input.type} ID ${input.id}.\n\n` +
          'This likely means the meta key has not been registered as REST-accessible on the WordPress site.\n\n' +
          PREREQUISITE,
        );
      }

      let parsed: unknown;
      try {
        parsed = typeof elementorData === 'string' ? JSON.parse(elementorData) : elementorData;
      } catch {
        parsed = elementorData;
      }

      return ok({
        id: input.id,
        type: input.type,
        elementor_edit_mode: meta['_elementor_edit_mode'] ?? null,
        elementor_version: meta['_elementor_version'] ?? null,
        elementor_data: parsed,
      });
    },
  );

  server.registerTool(
    'update_elementor_data',
    {
      title: 'Update Elementor Page Data',
      description: `Write Elementor builder data (JSON widget tree) to a post or page. Replaces the entire _elementor_data value.\n\n${PREREQUISITE}`,
      annotations: mutation,
      inputSchema: withAuth(
        z.object({
          id: id.describe('Post or page ID'),
          type: z.enum(['post', 'page']).default('page').describe('Content type'),
          elementor_data: z.union([z.string(), z.array(z.unknown())])
            .describe('Elementor widget tree as JSON string or array. Must be a valid Elementor structure.'),
          clear_css_cache: z.boolean().default(true)
            .describe('Clear Elementor CSS cache (recommended so changes appear on frontend)'),
        }),
      ),
    },
    async (input) => {
      const wp = makeClient(input.auth);
      const endpoint = input.type === 'page' ? 'pages' : 'posts';

      const dataString = typeof input.elementor_data === 'string'
        ? input.elementor_data
        : JSON.stringify(input.elementor_data);

      try {
        JSON.parse(dataString);
      } catch {
        throw new Error('elementor_data must be valid JSON. Provide a properly structured Elementor widget tree.');
      }

      const metaPayload: Record<string, string> = {
        _elementor_data: dataString,
        _elementor_edit_mode: 'builder',
      };

      if (input.clear_css_cache) {
        metaPayload['_elementor_css'] = '';
      }

      const result = await wp.call(`/wp/v2/${endpoint}/${input.id}`, 'POST', { meta: metaPayload });

      return ok(result, [
        `Elementor data updated for ${input.type} ID ${input.id}.`,
        input.clear_css_cache
          ? 'CSS cache cleared (will regenerate on next page load).'
          : 'CSS cache was NOT cleared. Run with clear_css_cache=true if changes do not appear.',
      ].join('\n'));
    },
  );
}
