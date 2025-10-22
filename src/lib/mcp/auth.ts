import { NextRequest } from 'next/server';

/**
 * Verify MCP API key for service-to-service authentication
 * This does NOT affect existing Auth0 authentication
 */
export function verifyMCPAuth(req: NextRequest): boolean {
  const apiKey = req.headers.get('X-MCP-API-Key');
  const expectedKey = process.env.MCP_API_KEY;
  
  if (!expectedKey) {
    console.warn('MCP_API_KEY not configured');
    return false;
  }
  
  return apiKey === expectedKey;
}

export class MCPAuthError extends Error {
  constructor() {
    super('Unauthorized MCP request');
    this.name = 'MCPAuthError';
  }
}