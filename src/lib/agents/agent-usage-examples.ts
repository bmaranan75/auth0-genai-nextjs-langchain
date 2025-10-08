/**
 * Usage Examples for Standalone Domain-Specific Agents
 * 
 * This file demonstrates how to use the upgraded agents independently
 * outside of the supervisor architecture.
 */

import { CartAndCheckoutAgent } from './cart-and-checkout-agent';
import { CatalogAgent } from './catalog-agent';
import { DealsAgent } from './deals-agent';
import { PaymentAgent } from './payment-agent';
import { SupervisorAgent } from './supervisor';

// ===== STANDALONE USAGE EXAMPLES =====

/**
 * Example 1: Supervisor Agent Usage (Recommended)
 */
export class IntelligentGroceryChatbot {
  private supervisorAgent: SupervisorAgent;

  constructor(private userId: string) {
    this.supervisorAgent = new SupervisorAgent(userId);
  }

  async handleMessage(message: string, sessionId?: string) {
    // Supervisor automatically routes to the right specialized agent
    return await this.supervisorAgent.chat(message, sessionId);
  }

  async streamResponse(message: string, sessionId?: string) {
    return await this.supervisorAgent.stream(message, sessionId);
  }
}

/**
 * Example 2: Direct Agent Usage for Specific Domains
 */
export class DirectAgentChatbot {
  private cartAgent: CartAndCheckoutAgent;
  private catalogAgent: CatalogAgent;
  private dealsAgent: DealsAgent;
  private paymentAgent: PaymentAgent;

  constructor(private userId: string) {
    this.cartAgent = new CartAndCheckoutAgent(userId);
    this.catalogAgent = new CatalogAgent(userId);
    this.dealsAgent = new DealsAgent(userId);
    this.paymentAgent = new PaymentAgent(userId);
  }

  async handleMessage(message: string, sessionId: string, agentType: 'cart' | 'catalog' | 'deals' | 'payment') {
    switch (agentType) {
      case 'cart':
        return await this.cartAgent.chat(message, sessionId);
      case 'catalog':
        return await this.catalogAgent.chat(message, sessionId);
      case 'deals':
        return await this.dealsAgent.chat(message, sessionId);
      case 'payment':
        return await this.paymentAgent.chat(message, sessionId);
      default:
        throw new Error('Unknown agent type');
    }
  }

  async getConversationHistory(sessionId: string, agentType: 'cart' | 'catalog' | 'deals' | 'payment') {
    switch (agentType) {
      case 'cart':
        return await this.cartAgent.getHistory(sessionId);
      case 'catalog':
        return await this.catalogAgent.getHistory(sessionId);
      case 'deals':
        return await this.dealsAgent.getHistory(sessionId);
      case 'payment':
        return await this.paymentAgent.getHistory(sessionId);
    }
  }
}

/**
 * Example 3: API Endpoint Integration with Supervisor
 */
export async function handleSmartGroceryAPI(userId: string, message: string, sessionId: string) {
  const supervisorAgent = new SupervisorAgent(userId);
  
  try {
    const response = await supervisorAgent.chat(message, sessionId);
    return {
      success: true,
      response: response.messages[response.messages.length - 1].content,
      sessionId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      sessionId,
    };
  }
}

/**
 * Example 4: Direct Catalog API (for specific use cases)
 */
export async function handleCatalogAPI(userId: string, message: string, sessionId: string) {
  const catalogAgent = new CatalogAgent(userId);
  
  try {
    const response = await catalogAgent.chat(message, sessionId);
    return {
      success: true,
      response: response.messages?.[response.messages.length - 1]?.content || response.content,
      sessionId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      sessionId,
    };
  }
}

/**
 * Example 3: Multi-tenant Agent Service
 */
export class MultiTenantAgentService {
  private agents: Map<string, {
    cart: CartAndCheckoutAgent;
    catalog: CatalogAgent;
    deals: DealsAgent;
    payment: PaymentAgent;
  }> = new Map();

  private getOrCreateAgents(userId: string) {
    if (!this.agents.has(userId)) {
      this.agents.set(userId, {
        cart: new CartAndCheckoutAgent(userId),
        catalog: new CatalogAgent(userId),
        deals: new DealsAgent(userId),
        payment: new PaymentAgent(userId),
      });
    }
    return this.agents.get(userId)!;
  }

  async processCartRequest(userId: string, message: string, sessionId: string) {
    const agents = this.getOrCreateAgents(userId);
    return await agents.cart.chat(message, sessionId);
  }

  async processCatalogRequest(userId: string, message: string, sessionId: string) {
    const agents = this.getOrCreateAgents(userId);
    return await agents.catalog.chat(message, sessionId);
  }

  async processDealsRequest(userId: string, message: string, sessionId: string) {
    const agents = this.getOrCreateAgents(userId);
    return await agents.deals.chat(message, sessionId);
  }

  async processPaymentRequest(userId: string, message: string, sessionId: string) {
    const agents = this.getOrCreateAgents(userId);
    return await agents.payment.chat(message, sessionId);
  }

  async clearUserSession(userId: string, sessionId: string) {
    const agents = this.getOrCreateAgents(userId);
    await Promise.all([
      agents.cart.clearSession(sessionId),
      agents.catalog.clearSession(sessionId),
      agents.deals.clearSession(sessionId),
      agents.payment.clearSession(sessionId),
    ]);
  }
}

/**
 * Example 4: Stream Processing for Real-time Chat
 */
export async function handleStreamingChat(userId: string, message: string, sessionId: string) {
  const catalogAgent = new CatalogAgent(userId);
  
  const stream = await catalogAgent.stream(message, sessionId);
  
  // Process streaming responses
  const responses = [];
  for await (const chunk of stream) {
    if (chunk.messages && chunk.messages.length > 0) {
      responses.push(chunk.messages[chunk.messages.length - 1]);
    }
  }
  
  return responses;
}

/**
 * Example 5: Session Management and Context Persistence
 */
export class SessionManager {
  private activeAgents: Map<string, any> = new Map();

  async createSession(userId: string, agentType: 'cart' | 'catalog' | 'deals' | 'payment') {
    const sessionId = `${agentType}-${userId}-${Date.now()}`;
    
    let agent;
    switch (agentType) {
      case 'cart':
        agent = new CartAndCheckoutAgent(userId);
        break;
      case 'catalog':
        agent = new CatalogAgent(userId);
        break;
      case 'deals':
        agent = new DealsAgent(userId);
        break;
      case 'payment':
        agent = new PaymentAgent(userId);
        break;
    }

    this.activeAgents.set(sessionId, agent);
    return sessionId;
  }

  async sendMessage(sessionId: string, message: string) {
    const agent = this.activeAgents.get(sessionId);
    if (!agent) {
      throw new Error('Session not found');
    }

    return await agent.chat(message, sessionId);
  }

  async getSessionHistory(sessionId: string) {
    const agent = this.activeAgents.get(sessionId);
    if (!agent) {
      throw new Error('Session not found');
    }

    return await agent.getHistory(sessionId);
  }

  async closeSession(sessionId: string) {
    const agent = this.activeAgents.get(sessionId);
    if (agent) {
      await agent.clearSession(sessionId);
      this.activeAgents.delete(sessionId);
    }
  }
}

/**
 * Example 6: Integration with External Systems
 */
export class ExternalSystemIntegration {
  async integrateWithSlackBot(userId: string, slackMessage: string, channelId: string) {
    // Determine which agent to use based on message content
    const agentType = this.determineAgentType(slackMessage);
    
    let agent;
    switch (agentType) {
      case 'cart':
        agent = new CartAndCheckoutAgent(userId);
        break;
      case 'catalog':
        agent = new CatalogAgent(userId);
        break;
      case 'deals':
        agent = new DealsAgent(userId);
        break;
      case 'payment':
        agent = new PaymentAgent(userId);
        break;
      default:
        agent = new CatalogAgent(userId); // Default to catalog
    }

    const sessionId = `slack-${channelId}-${userId}`;
    return await agent.chat(slackMessage, sessionId);
  }

  async integrateWithWebhook(userId: string, webhookPayload: any) {
    const { message, agentType, sessionId } = webhookPayload;
    
    let agent;
    switch (agentType) {
      case 'cart':
        agent = new CartAndCheckoutAgent(userId);
        break;
      case 'catalog':
        agent = new CatalogAgent(userId);
        break;
      case 'deals':
        agent = new DealsAgent(userId);
        break;
      case 'payment':
        agent = new PaymentAgent(userId);
        break;
      default:
        throw new Error('Invalid agent type');
    }

    return await agent.chat(message, sessionId);
  }

  private determineAgentType(message: string): 'cart' | 'catalog' | 'deals' | 'payment' {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('add to cart') || lowerMessage.includes('checkout') || lowerMessage.includes('buy')) {
      return 'cart';
    }
    if (lowerMessage.includes('deal') || lowerMessage.includes('discount') || lowerMessage.includes('save')) {
      return 'deals';
    }
    if (lowerMessage.includes('payment') || lowerMessage.includes('credit card') || lowerMessage.includes('pay')) {
      return 'payment';
    }
    return 'catalog'; // Default to catalog for product searches
  }
}

// ===== USAGE EXAMPLES =====

// ===== LANGGRAPH FRAMEWORK INTEGRATION =====

/**
 * LangGraph Server Compatible Usage
 * 
 * The supervisor and agents are fully LangGraph framework compliant:
 * - StateGraph with proper Annotation.Root state management
 * - Thread-based memory management with MemorySaver
 * - Proper tool integration with ToolNode
 * - Stream support for real-time responses
 */

/*
// Example usage in an API route with Supervisor (RECOMMENDED):
export async function POST(request: Request) {
  const { userId, message, sessionId } = await request.json();
  
  // Supervisor automatically routes to the right agent
  const supervisor = new SupervisorAgent(userId);
  const response = await supervisor.chat(message, sessionId);
  
  return Response.json({ response });
}

// Example usage in a Next.js page with intelligent routing:
const chatbot = new IntelligentGroceryChatbot(user.id);
const response = await chatbot.handleMessage("Add 5 apples to cart", sessionId);
// Supervisor will route: Catalog → Deals → Cart automatically

// Example usage with direct agent access:
const catalogAgent = new CatalogAgent(user.id);
const response = await catalogAgent.chat("Show me organic vegetables", sessionId);

// Example usage with streaming:
const supervisor = new SupervisorAgent(user.id);
const stream = await supervisor.stream("Find deals on milk and add to cart", sessionId);
for await (const chunk of stream) {
  console.log(chunk);
}

// LangGraph Server Integration:
// All agents are exported and configured in langgraph.json:
// {
//   "graphs": {
//     "supervisor": "./src/lib/agents/supervisor.ts:supervisorGraph",
//     "catalog": "./src/lib/agents/catalog-agent.ts:catalogGraph",
//     "cart_and_checkout": "./src/lib/agents/cart-and-checkout-agent.ts:cartAndCheckoutGraph",
//     "payment": "./src/lib/agents/payment-agent.ts:paymentGraph",
//     "deals": "./src/lib/agents/deals-agent.ts:dealsGraph"
//   }
// }
*/