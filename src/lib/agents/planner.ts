import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
// SupervisorState type import removed to avoid circular/type issues - use `any` for state
import { responseTool, delegateTool } from "../tools/routing";
import { BaseMessage, AIMessage } from "@langchain/core/messages";

const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

// Create a new model instance with the enhanced routing tools bound to it
const plannerLlm = llm.bindTools([responseTool, delegateTool], {
  tool_choice: "any",
});

const plannerPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are an intelligent routing planner for a grocery shopping assistant. 

AVAILABLE SPECIALIZED AGENTS AND THEIR CAPABILITIES:
- catalog: Product search, catalog browsing, finding products, availability checks, product information
- cart_and_checkout: Adding/removing items from cart, viewing cart contents, cart management (for simple cart operations)
- deals: Finding deals, promotions, discounts, special offers, price comparisons, checking for savings on specific products
- payment: Processing payments, payment methods, billing information, payment issues
- notification_agent: Order notifications, confirmations, status updates
- supervisor: Complex workflows requiring multiple agents, multi-step processes, deal confirmations

YOUR DECISION PROCESS:
1. DIRECT RESPONSE: Answer immediately if it's a simple greeting, general advice, store policies, or basic question you can answer without specialized knowledge
2. DELEGATE TO AGENT: Route to the appropriate specialized agent for specific tasks, OR to supervisor for complex workflows

KEY ROUTING PATTERNS:
- Questions about deals, discounts, promotions, savings, special offers → ALWAYS delegate to deals agent
- Product search, finding items, browsing catalog → delegate to catalog agent
- Cart operations (add, view, remove items) → delegate to supervisor for workflow management
- Payment and billing → delegate to payment agent

EXAMPLES:
- "Hello" → DIRECT RESPONSE
- "What are your store hours?" → DIRECT RESPONSE  
- "How do I cook pasta?" → DIRECT RESPONSE (general cooking advice)
- "Find organic apples" → DELEGATE to catalog
- "What deals are available today?" → DELEGATE to deals
- "Check deals for milk" → DELEGATE to deals
- "Find promotions on vegetables" → DELEGATE to deals
- "Are there discounts on bread?" → DELEGATE to deals
- "Show me special offers" → DELEGATE to deals
- "Add bananas to my cart" → DELEGATE to supervisor (for cart workflow management)
- "View my cart" → DELEGATE to supervisor (for cart operations)
- "Checkout my order" → DELEGATE to supervisor (for complex checkout process)
- "Complete my purchase" → DELEGATE to supervisor (for complex checkout process)
- "Update my payment method" → DELEGATE to payment
- "Send me order confirmation" → DELEGATE to notification_agent

IMPORTANT: Distinguish between:
- Simple cart operations (add, remove, view) → cart_and_checkout
- Complex workflows (checkout, multi-step processes) → supervisor

Choose wisely to minimize unnecessary agent calls while ensuring specialized tasks go to the right agent. Always provide clear reasoning for your delegation choice.`,
  ],
  ["placeholder", "{messages}"],
]);

const planner = async (state: any) => {
  console.log("---PLANNER---");
  const { messages } = state;

  const response = await plannerLlm.invoke(messages.map((m: any) => m.message));
  console.log("[planner] Raw LLM response:", JSON.stringify(response, null, 2));

  // The planner uses tool_choice: "any", so it will always return a tool call
  // We need to properly extract the content from the tool call arguments
  let finalContent: string = "";
  let delegationInfo: any = null;

  if (response && response.tool_calls && response.tool_calls.length > 0) {
    const toolCall = response.tool_calls[0];
    console.log(`[planner] Tool call: ${toolCall.name}`, toolCall.args);
    
    if (toolCall.name === "direct_response") {
      // Extract the answer from the direct_response tool
      finalContent = toolCall.args?.answer || "I apologize, but I couldn't generate a proper response.";
      console.log("[planner] Providing direct response");
      
    } else if (toolCall.name === "delegate_to_agent") {
      // Extract delegation information
      delegationInfo = {
        targetAgent: toolCall.args?.agent,
        task: toolCall.args?.task,
        reasoning: toolCall.args?.reasoning
      };
      
      finalContent = `Let me help you with that. I'm routing your request to our ${delegationInfo.targetAgent} specialist.`;
      console.log(`[planner] Delegating to ${delegationInfo.targetAgent}: ${delegationInfo.task}`);
      console.log(`[planner] Reasoning: ${delegationInfo.reasoning}`);
    }
  } else {
    // Fallback for unexpected response format - this should NOT happen with tool_choice: "any"
    console.error("[planner] CRITICAL: No tool calls found despite tool_choice: 'any'");
    console.error("[planner] Response structure:", JSON.stringify(response, null, 2));
    console.error("[planner] This indicates a planner configuration issue!");
    
    const content = response?.content;
    finalContent = typeof content === 'string' ? content : "I'm having trouble routing your request. Let me try to help you directly.";
    
    // Log the input to help debug why tools weren't called
    console.error("[planner] Input messages that failed to trigger tools:", JSON.stringify(messages.map((m: any) => m.message?.content || m.message), null, 2));
  }

  // Create a clean AIMessage with the extracted content and delegation info
  const normalized = new AIMessage({
    content: finalContent,
    tool_calls: response.tool_calls // Preserve tool calls for routing
  });

  return {
    messages: [
      {
        message: normalized,
        role: "assistant", 
        agent: "planner",
        timestamp: Date.now(),
        // Add delegation metadata for supervisor routing
        delegation: delegationInfo
      },
    ],
  };
};

export { planner };
