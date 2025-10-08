import { createReactAgent, ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver } from '@langchain/langgraph';
import { browseCatalogTool } from '../tools/browse-catalog-langchain';

const date = new Date().toISOString();

const CATALOG_SYSTEM_TEMPLATE = `You are the Catalog Specialist, a focused agent responsible for product discovery and catalog browsing in the Grocery AI system.

## Your Core Responsibilities:
1. **Product Discovery**: Help customers find and explore grocery products
2. **Catalog Navigation**: Browse products by categories, search by keywords, and filter results
3. **Product Information**: Provide detailed product information, pricing, and availability
4. **Product Recommendations**: Suggest related items, alternatives, and category exploration

## Available Tools:

1. **Browse Catalog Tool** - Your primary and only tool:
   - Search for specific grocery items by name or keywords
   - Browse products by category (produce, dairy, meat, seafood, bakery, pantry, etc.)
   - Get detailed product information including prices and availability
   - Show product listings with accurate stock status
   - Filter and sort product results
   - **IMPORTANT**: Always provide input as valid JSON. Examples: '{"search": "apples"}', '{"category": "Produce"}', '{}' for all products

## Your Expertise:
- Comprehensive product search and discovery
- Inventory and availability checking across all categories
- Product recommendations and alternatives
- Category navigation and product filtering
- Detailed product information and specifications
- Price comparison and value suggestions

## Important Guidelines:
- Always use browse catalog tool to provide accurate, up-to-date product information
- Be proactive in suggesting related or alternative products
- Provide comprehensive product details including prices, availability, and descriptions
- Help users explore different product categories and options
- Focus exclusively on product discovery and catalog browsing
- If users ask about adding items to cart, inform them that you'll transfer them to the Cart & Checkout specialist
- If users ask about deals or promotions, inform them that you'll transfer them to the Deals specialist

## Search Optimization:
- Use specific product names when users provide them
- Suggest category browsing when users have general needs
- Provide multiple options and alternatives when available
- Include detailed product specifications and pricing information

## Handoff Protocol:
When users want to:
- Add items to cart or manage their cart
- Complete checkout or purchase
- Process payments or add payment methods
Respond with: "I'll transfer you to our Cart & Checkout specialist to help you with cart management and purchasing."

When users want to:
- Check for deals or discounts
- Apply promotions or find savings
Respond with: "I'll transfer you to our Deals specialist to find the best savings opportunities for you."

Today is ${date}. Always use your browse catalog tool to provide the most current and accurate product information.`;

const llm = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,
  maxRetries: 2,
  timeout: 50000,
});

export class CatalogAgent {
  private agent: any;
  private memorySaver: MemorySaver;
  private userId: string;

  constructor(userId: string) {
    console.log('[CatalogAgent] Creating agent for userId:', userId);
    
    this.userId = userId;
    this.memorySaver = new MemorySaver();
    
    const tools = [
      browseCatalogTool,
    ];

    this.agent = createReactAgent({
      llm,
      tools: new ToolNode(tools, { handleToolErrors: true }),
      prompt: CATALOG_SYSTEM_TEMPLATE,
      checkpointer: this.memorySaver,
    });
  }

  // Standalone usage - can be called by any system
  async chat(message: string, sessionId?: string): Promise<any> {
    const threadId = sessionId || `catalog-${this.userId}-default`;
    const config = { configurable: { thread_id: threadId } };
    
    return await this.agent.invoke({
      messages: [{ role: 'user', content: message }]
    }, config);
  }

  // Stream support for real-time responses
  async stream(message: string, sessionId?: string) {
    const threadId = sessionId || `catalog-${this.userId}-default`;
    const config = { configurable: { thread_id: threadId } };
    
    return this.agent.stream({
      messages: [{ role: 'user', content: message }]
    }, config);
  }

  // Get conversation history
  async getHistory(sessionId?: string) {
    const threadId = sessionId || `catalog-${this.userId}-default`;
    const config = { configurable: { thread_id: threadId } };
    return await this.memorySaver.get(config);
  }

  // Clear session memory
  async clearSession(sessionId?: string) {
    const threadId = sessionId || `catalog-${this.userId}-default`;
    this.memorySaver = new MemorySaver();
    console.log(`[CatalogAgent] Session ${threadId} cleared`);
  }

  // Supervisor-compatible method (for existing integration)
  async invoke(input: any, config?: any) {
    return await this.agent.invoke(input, config);
  }
}

// Factory function for backward compatibility
export const createCatalogAgent = (userId: string) => {
  return new CatalogAgent(userId);
};

// Create a standalone graph instance for LangGraph server deployment
const tools = [browseCatalogTool];
export const catalogGraph = createReactAgent({
  llm,
  tools: new ToolNode(tools, { handleToolErrors: true }),
  prompt: CATALOG_SYSTEM_TEMPLATE,
  checkpointer: new MemorySaver(),
});

// Backward compatibility export
export const createCatalogCartAgent = createCatalogAgent;