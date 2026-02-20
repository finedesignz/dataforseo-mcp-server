import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerContentTools } from './content.js';
import { registerUserTools } from './users.js';
import { registerTaxonomyTools } from './taxonomy.js';
import { registerCommentTools } from './comments.js';
import { registerSettingsTools } from './settings.js';
import { registerAdminTools } from './admin.js';
import { registerCustomPostTypeTools } from './custom.js';
import { registerElementorTools } from './elementor.js';
import { registerSeoTools } from './seo.js';

export function registerTools(server: McpServer) {
  registerContentTools(server);          // posts, pages, media (incl. bulk ops, slug lookups)
  registerUserTools(server);             // users CRUD
  registerTaxonomyTools(server);         // categories, tags
  registerCommentTools(server);          // comments
  registerSettingsTools(server);         // site settings, search, test_connection
  registerAdminTools(server);            // plugins, themes, revisions, menus, patterns
  registerCustomPostTypeTools(server);   // generic custom post type CRUD
  registerElementorTools(server);        // elementor data read/write
  registerSeoTools(server);              // rankmath SEO
}
