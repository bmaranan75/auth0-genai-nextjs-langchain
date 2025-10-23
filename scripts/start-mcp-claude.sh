#!/bin/bash
# Wrapper script to start MCP SSE server for Claude Desktop
# Redirects server logs to a file to avoid JSON parsing errors

# Load environment variables
export NEXTJS_URL=${NEXTJS_URL:-"http://localhost:3000"}
export MCP_API_KEY=${MCP_API_KEY:-"2cf6ea0bd761a602e81f69aebbc77d676dccf454a5bb650ab8d1f637a249493e"}
export MCP_SERVER_PORT=${MCP_SERVER_PORT:-"3001"}
export MCP_SERVER_HOST=${MCP_SERVER_HOST:-"127.0.0.1"}
export MCP_AUTH_MODE=${MCP_AUTH_MODE:-"api-key"}

# Log file location
LOG_FILE="/tmp/mcp-server-claude.log"

# Start the server and redirect stderr to log file
exec npx -y tsx src/mcp/server.ts 2>"$LOG_FILE"
