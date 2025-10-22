#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const client_js_1 = require("./client.js");
const tools_js_1 = require("./tools.js");
/**
 * MCP Server that exposes LangGraph agents via HTTP
 * This runs as a separate process from Next.js
 *
 * Architecture:
 * MCP Client (Claude Desktop) -> MCP Server (this file) -> Next.js API -> LangGraph Agents
 */
// Configuration from environment
const NEXTJS_URL = process.env.NEXTJS_URL || 'http://localhost:3000';
const MCP_API_KEY = process.env.MCP_API_KEY;
if (!MCP_API_KEY) {
    console.error('ERROR: MCP_API_KEY environment variable is required');
    console.error('Please set MCP_API_KEY in your .env.local file');
    process.exit(1);
}
// Initialize HTTP client
const agentClient = new client_js_1.MCPAgentClient(NEXTJS_URL, MCP_API_KEY);
// Create MCP server
const server = new index_js_1.Server({
    name: 'safeway-shopping-assistant',
    version: '1.0.0',
}, {
    capabilities: {
        tools: {},
    },
});
// Handle list_tools request
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
    console.error('[MCP Server] Listing tools');
    return { tools: tools_js_1.mcpTools };
});
// Handle call_tool request
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.error(`[MCP Server] Tool called: ${name}`, JSON.stringify(args, null, 2));
    try {
        let result;
        // Route tool calls to appropriate agents via HTTP
        switch (name) {
            case 'search_products':
                result = await agentClient.callAgent('catalog', {
                    action: 'search',
                    query: args.query,
                    category: args.category,
                    limit: args.limit,
                });
                break;
            case 'add_to_cart':
                result = await agentClient.callAgent('cart', {
                    action: 'add',
                    productCode: args.productCode,
                    quantity: args.quantity,
                });
                break;
            case 'view_cart':
                result = await agentClient.callAgent('cart', {
                    action: 'view',
                });
                break;
            case 'checkout':
                result = await agentClient.callAgent('cart', {
                    action: 'checkout',
                    cartSummary: args.cartSummary,
                });
                break;
            case 'add_payment_method':
                result = await agentClient.callAgent('payment', {
                    action: 'add',
                    type: args.type,
                });
                break;
            case 'get_deals':
                result = await agentClient.callAgent('deals', {
                    action: 'get',
                    category: args.category,
                });
                break;
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
        console.error(`[MCP Server] Tool ${name} completed successfully`);
        // Extract the final AI message content from the result
        let responseText = '';
        if (result && result.messages && Array.isArray(result.messages)) {
            // Get the last AI message
            const lastMessage = result.messages[result.messages.length - 1];
            if (lastMessage && lastMessage.kwargs && lastMessage.kwargs.content) {
                responseText = lastMessage.kwargs.content;
            }
            else {
                // Fallback to full result
                responseText = JSON.stringify(result, null, 2);
            }
        }
        else {
            responseText = JSON.stringify(result, null, 2);
        }
        return {
            content: [
                {
                    type: 'text',
                    text: responseText,
                },
            ],
        };
    }
    catch (error) {
        console.error(`[MCP Server] Tool ${name} failed:`, error);
        return {
            content: [
                {
                    type: 'text',
                    text: `Error: ${error.message}`,
                },
            ],
            isError: true,
        };
    }
});
// Start MCP server
async function main() {
    console.error('[MCP Server] Starting Safeway Shopping Assistant MCP Server...');
    console.error(`[MCP Server] Next.js URL: ${NEXTJS_URL}`);
    console.error(`[MCP Server] MCP_API_KEY: ${MCP_API_KEY.substring(0, 10)}... (truncated)`);
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error('[MCP Server] Running on stdio transport');
    console.error('[MCP Server] Ready to receive MCP requests from Claude Desktop');
    console.error('[MCP Server] Available tools:', tools_js_1.mcpTools.map(t => t.name).join(', '));
}
main().catch((error) => {
    console.error('[MCP Server] Fatal error:', error);
    process.exit(1);
});
