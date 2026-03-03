# WordPress MCP Server

Multi-tool Model Context Protocol server for WordPress administration. Tools are stateless and require per-call auth, so no credentials live in the server process.

## Features (33 tools)
- Content: posts/pages CRUD, media update/delete.
- Taxonomy: categories & tags CRUD.
- Comments: list/create/update/delete, status filters.
- Settings & Search: get/update settings, global search.
- Admin: plugins (list/activate/deactivate), themes (list/activate), revisions, template parts.
- SEO: Rank Math meta update.
- Page Generator Pro: REST CRUD for content groups (generation still requires WP Admin because the plugin uses nonce-protected AJAX).
- PGP generation helper: guidance route that directs agents to run generation in the WP Admin UI (cannot be done via application passwords).

## Auth Model (per call)
Each tool input must include:
```json
{
  "auth": {
    "baseUrl": "https://site.com",
    "username": "app_user",
    "appPassword": "xxxx xxxx xxxx xxxx"
  },
  ...toolSpecificFields
}
```
No env vars or stored secrets are required.

## Run locally
```bash
npm install
npm run build
node dist/index.js   # stdio MCP server
```

## Docker
```bash
docker build -t wordpress-mcp .
docker run --rm -i wordpress-mcp
```

## Recommended Agents

The 80 available tools split naturally into four focused agents. Use these as starting configurations in your MCP client — give each agent only the tools it needs so it stays on-task and avoids accidentally touching unrelated parts of the site.

<details>
<summary><strong>Content Management Agent</strong> (~30 tools) — posts, pages, media, custom post types, revisions</summary>

**Purpose:** Day-to-day editorial work: drafting, publishing, updating, and removing content across all content types.

**Tools:**
- **Posts (8):** `list_posts`, `get_post`, `get_post_by_slug`, `create_post`, `update_post`, `delete_post`, `bulk_update_posts`, `bulk_delete_posts`
- **Pages (6):** `list_pages`, `get_page`, `get_page_by_slug`, `create_page`, `update_page`, `delete_page`
- **Media (6):** `list_media`, `get_media`, `upload_media`, `update_media`, `delete_media`, `bulk_update_media`
- **Custom Post Types (6):** `list_post_types`, `list_custom_posts`, `get_custom_post`, `create_custom_post`, `update_custom_post`, `delete_custom_post`
- **Revisions (3):** `list_post_revisions`, `list_page_revisions`, `get_revision`

**Example prompts:**
- "Publish the draft post titled 'Q1 Recap' and set the featured image to media ID 42."
- "Bulk-update all posts in category 5 to add the tag 'evergreen'."
- "Show me the last 5 revisions of page ID 10 and restore the second-most-recent one."

</details>

<details>
<summary><strong>Site Admin Agent</strong> (~22 tools) — plugins, themes, menus, blocks/templates, settings, users</summary>

**Purpose:** Infrastructure and configuration: managing installed plugins and themes, navigation menus, block patterns, global settings, and user accounts.

**Tools:**
- **Plugins (6):** `list_plugins`, `get_plugin`, `activate_plugin`, `deactivate_plugin`, `install_plugin`, `delete_plugin`
- **Themes (3):** `list_themes`, `get_theme`, `activate_theme`
- **Menus (5):** `list_menus`, `get_menu`, `create_menu`, `update_menu`, `delete_menu`
- **Blocks & Templates (3):** `list_template_parts`, `list_block_patterns`, `list_reusable_blocks`
- **Settings & Search (4):** `test_connection`, `get_settings`, `update_settings`, `search_content`
- **Users (5):** `list_users`, `get_user`, `create_user`, `update_user`, `delete_user`

**Example prompts:**
- "Install and activate the 'WP Super Cache' plugin."
- "Create a new editor-role user account for the contractor joining next week."
- "Add a 'Shop' link to the primary navigation menu."

</details>

<details>
<summary><strong>Community & Taxonomy Agent</strong> (~15 tools) — comments, categories, tags</summary>

**Purpose:** Audience engagement and content organisation: moderating comments and maintaining the category and tag taxonomy.

**Tools:**
- **Comments (5):** `list_comments`, `get_comment`, `create_comment`, `update_comment`, `delete_comment`
- **Categories (5):** `list_categories`, `get_category`, `create_category`, `update_category`, `delete_category`
- **Tags (5):** `list_tags`, `get_tag`, `create_tag`, `update_tag`, `delete_tag`

**Example prompts:**
- "List all pending comments and approve the ones that don't contain spam."
- "Create a 'Case Studies' category nested under 'Resources' and apply it to posts tagged 'client-story'."
- "Delete all tags that have zero posts assigned."

</details>

<details>
<summary><strong>SEO & Page Builder Agent</strong> (~10 tools) — RankMath, Elementor, Page Generator Pro</summary>

**Purpose:** Search optimisation and programmatic page generation: managing per-post SEO metadata, Elementor page data, and Page Generator Pro content groups.

**Tools:**
- **RankMath SEO (3):** `get_rankmath_head`, `get_rankmath_meta`, `update_rankmath_meta`
- **Elementor (2):** `get_elementor_data`, `update_elementor_data`
- **Page Generator Pro (5):** `list_page_generator_groups`, `get_page_generator_group`, `create_page_generator_group`, `update_page_generator_group`, `delete_page_generator_group`

**Example prompts:**
- "Update the RankMath focus keyword and meta description for all posts in the 'Guides' category."
- "Create a Page Generator Pro group that produces 50 city-specific landing pages from a CSV keyword list."
- "Fetch the Elementor data for page ID 99 and change the hero headline text."

> **Note:** Page Generator Pro *generation* (actually running a group to produce pages) requires WP Admin because the plugin uses nonce-protected AJAX — this agent can only manage the group definitions via REST.

</details>

## Development
- TypeScript ESM (`tsconfig` NodeNext). 
- Lint: `npm run lint`
- Tests: `npm test` (placeholder smoke test).
- Build: `npm run build`

## Notes
- Media upload and Elementor-specific updates are not yet implemented (metadata only).
- If a site lacks an endpoint (e.g., Rank Math), the tool will return the upstream 404/401.
- Keep WordPress app passwords scoped to the user; rotate if shared.
