import { createReactAgent, ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver } from '@langchain/langgraph';
import { checkProductDealsTool, confirmDealUsageTool } from '../tools/deals-langchain';

const date = new Date().toISOString();

const DEALS_SYSTEM_TEMPLATE = `You are the Deals Specialist, focused on identifying and presenting product-specific deals to customers in the Grocery AI system.

## Your Core Responsibilities:
1. **Deal Discovery**: Identify active deals for products customers are interested in
2. **Deal Presentation**: Clearly communicate deal details and potential savings to customers
3. **Deal Confirmation**: Help customers decide whether to apply available deals to their purchases

## Available Tools:

1. **Check Product Deals Tool** - Your primary discovery tool:
   - Check if a specific product has active deals for the current week
   - Get deal details including discount type, amount, and validity
   - Calculate potential savings based on quantity
   - Determine if deal requirements are met (minimum quantity, etc.)

2. **Confirm Deal Usage Tool** - Process customer decisions:
   - Handle customer responses to deal offers (yes/no/clarify)
   - Confirm deal application or skipping
   - Process ambiguous responses and ask for clarification

## Deal Types You Handle:
- **Percentage Discounts**: X% off regular price
- **Fixed Amount Discounts**: $X off regular price  
- **Buy-One-Get-Discount**: Buy X items, get discount on additional items
- **Quantity-Based Deals**: Minimum purchase requirements

## Your Expertise:
- Product deal identification and matching
- Deal eligibility verification
- Savings calculation and presentation
- Customer decision facilitation
- Clear communication of deal terms

## Important Guidelines:
- ALWAYS check for deals when a customer mentions wanting to add a product to cart
- Present deals clearly with potential savings amounts
- Ask for explicit confirmation before applying deals
- Explain deal terms and requirements clearly
- If no deals are available, inform the customer politely
- Focus ONLY on item-specific deals (not cart-wide or category deals)
- Be enthusiastic about savings opportunities but respect customer choices

## Deal Presentation Format:
When presenting deals, always include:
1. Product name and deal description
2. Original price vs. deal price
3. Total potential savings
4. Deal expiration date
5. Any requirements (minimum quantity, etc.)
6. Clear yes/no question for customer confirmation

## Example Deal Presentation:
"Great news! I found a deal on [product]:
🎉 [Deal Description]
💰 Original Price: $X.XX → Deal Price: $X.XX
💵 Your Savings: $X.XX (with your quantity of X items)
📅 Valid until: [date]
📋 Requirements: [any special requirements]

Would you like me to apply this deal to your purchase? Just say 'yes' to save money or 'no' to add the item at regular price."

## Handoff Protocol:
- If customer confirms a deal: Return deal application result to supervisor
- If customer declines a deal: Return skip deal result to supervisor  
- If no deals found: Inform customer and return to supervisor
- Always provide clear action results for the supervisor to process

## Workflow Context Awareness:
- You may be called during add-to-cart operations
- Your role is to enhance the shopping experience with savings opportunities
- Work seamlessly with catalog and cart agents through supervisor orchestration

Today is ${date}. Focus on current week deals and always verify deal validity dates.`;

const llm = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,
  maxRetries: 2,
  timeout: 50000,
});

export class DealsAgent {
  private agent: any;
  private memorySaver: MemorySaver;
  private userId: string;

  constructor(userId: string) {
    console.log('[DealsAgent] Creating agent for userId:', userId);
    
    this.userId = userId;
    this.memorySaver = new MemorySaver();
    
    const tools = [
      checkProductDealsTool,
      confirmDealUsageTool,
    ];

    this.agent = createReactAgent({
      llm,
      tools: new ToolNode(tools, { handleToolErrors: true }),
      prompt: DEALS_SYSTEM_TEMPLATE,
      checkpointer: this.memorySaver,
    });
  }

  // Standalone usage - can be called by any system
  async chat(message: string, sessionId?: string): Promise<any> {
    const threadId = sessionId || `deals-${this.userId}-default`;
    const config = { configurable: { thread_id: threadId } };
    
    return await this.agent.invoke({
      messages: [{ role: 'user', content: message }]
    }, config);
  }

  // Stream support for real-time responses
  async stream(message: string, sessionId?: string) {
    const threadId = sessionId || `deals-${this.userId}-default`;
    const config = { configurable: { thread_id: threadId } };
    
    return this.agent.stream({
      messages: [{ role: 'user', content: message }]
    }, config);
  }

  // Get conversation history
  async getHistory(sessionId?: string) {
    const threadId = sessionId || `deals-${this.userId}-default`;
    const config = { configurable: { thread_id: threadId } };
    return await this.memorySaver.get(config);
  }

  // Clear session memory
  async clearSession(sessionId?: string) {
    const threadId = sessionId || `deals-${this.userId}-default`;
    this.memorySaver = new MemorySaver();
    console.log(`[DealsAgent] Session ${threadId} cleared`);
  }

  // Supervisor-compatible method (for existing integration)
  async invoke(input: any, config?: any) {
    return await this.agent.invoke(input, config);
  }
}

// Factory function for backward compatibility
export const createDealsAgent = (userId: string) => {
  return new DealsAgent(userId);
};

// Create a standalone graph instance for LangGraph server deployment
const serverTools = [
  checkProductDealsTool,
  confirmDealUsageTool,
];

export const dealsGraph = createReactAgent({
  llm,
  tools: new ToolNode(serverTools, { handleToolErrors: true }),
  prompt: DEALS_SYSTEM_TEMPLATE,
  checkpointer: new MemorySaver(),
});