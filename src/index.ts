#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from 'node:http';
import { registerTools } from './tools/register.js';

const SERVER_NAME = 'wordpress-mcp';
const SERVER_VERSION = '1.0.0';

function createMcpServer(): McpServer {
  const s = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    description: 'WordPress MCP server for managing posts, pages, media, users, Elementor, taxonomies, comments, settings, plugins, themes, navigation menus, and Rank Math SEO via the WordPress REST API.',
  });
  registerTools(s);
  return s;
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 0;
const MCP_API_KEY = process.env.MCP_API_KEY || '';
const mode = PORT > 0 ? 'http' : 'stdio';

if (mode === 'http') {
  if (!MCP_API_KEY) {
    console.error('WARNING: MCP_API_KEY is not set — the /mcp endpoint is unprotected.');
  }

  // HTTP mode: stateless Streamable HTTP — each request gets a fresh McpServer
  // (the SDK requires a separate Protocol instance per connection)
  const httpServer = createServer(async (req, res) => {
    // Health check endpoint (no auth required)
    if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', name: SERVER_NAME, version: SERVER_VERSION }));
      return;
    }

    // MCP endpoint — require Bearer token when MCP_API_KEY is set
    if (req.method === 'POST' && req.url === '/mcp') {
      if (MCP_API_KEY) {
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
        if (token !== MCP_API_KEY) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized', message: 'Invalid or missing Bearer token' }));
          return;
        }
      }

      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.error(`WordPress MCP server running on http://0.0.0.0:${PORT}/mcp`);
  });
} else {
  // Stdio mode: for local CLI / Claude Desktop usage
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
}
