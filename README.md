# WordPress MCP Server

Multi-tool Model Context Protocol server for WordPress administration. Tools are stateless and require per-call auth, so no credentials live in the server process.

## Features (33 tools)
- Content: posts/pages CRUD, media update/delete.
- Taxonomy: categories & tags CRUD.
- Comments: list/create/update/delete, status filters.
- Settings & Search: get/update settings, global search.
- Admin: plugins (list/activate/deactivate), themes (list/activate), revisions, template parts.
- SEO: Rank Math meta update.

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

## Development
- TypeScript ESM (`tsconfig` NodeNext). 
- Lint: `npm run lint`
- Tests: `npm test` (placeholder smoke test).
- Build: `npm run build`

## Notes
- Media upload and Elementor-specific updates are not yet implemented (metadata only).
- If a site lacks an endpoint (e.g., Rank Math), the tool will return the upstream 404/401.
- Keep WordPress app passwords scoped to the user; rotate if shared.
