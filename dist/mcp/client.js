"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPAgentClient = void 0;
/**
 * HTTP client for MCP server to call Next.js API routes
 * This does NOT affect existing Next.js functionality
 */
class MCPAgentClient {
    baseUrl;
    apiKey;
    constructor(baseUrl, apiKey) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
    }
    /**
     * Call an agent via HTTP with retry logic
     */
    async callAgent(agentName, data, retries = 3) {
        const endpoint = `${this.baseUrl}/api/mcp/agents/${agentName}`;
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                console.error(`[MCP Client] Calling ${agentName}:`, JSON.stringify(data, null, 2));
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-MCP-API-Key': this.apiKey,
                    },
                    body: JSON.stringify(data),
                    signal: AbortSignal.timeout(30000), // 30s timeout
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }
                const result = await response.json();
                console.error(`[MCP Client] Success from ${agentName}`);
                return result;
            }
            catch (error) {
                console.error(`[MCP Client] Attempt ${attempt + 1} failed:`, error.message);
                if (attempt === retries - 1) {
                    throw new Error(`Failed after ${retries} attempts: ${error.message}`);
                }
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
            }
        }
    }
}
exports.MCPAgentClient = MCPAgentClient;
