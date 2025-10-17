import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
// SupervisorState type import removed to avoid circular/type issues - use `any` for state
import { BaseMessage, AIMessage, SystemMessage } from "@langchain/core/messages";

// Use a smaller/cheaper model for planning to save cost and reduce latency.
// Planner only drafts structured JSON plans and does NOT call agents/tools.
// Lazily initialize the LLM so tests (without API keys) don't throw on module load.
let plannerLlm: any = null;
function getPlannerLlm() {
  if (plannerLlm) return plannerLlm;
  try {
    // Try to instantiate a real ChatOpenAI client. This may throw if no API key is present.
    plannerLlm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.0, maxRetries: 1 });
    return plannerLlm;
  } catch (e) {
    // Fallback mock for test environments: deterministic minimal API compatible object
    plannerLlm = {
      invoke: async (msgs: any) => {
        // Return a conservative recommendation to supervisor to be safe
        return { content: JSON.stringify({ action: 'delegate', targetAgent: 'supervisor', confidence: 0.5, reasoning: 'fallback mock recommendation' }) };
      }
    };
    return plannerLlm;
  }
}

// Simple in-memory TTL cache for planner outputs. Replace with Redis in prod.
type CacheEntry = { value: any; expiresAt: number };
const plannerCache = new Map<string, CacheEntry>();
// Simple in-memory metrics for planner cache and invalidations
const plannerMetrics = {
  hits: 0,
  misses: 0,
  sets: 0,
  invalidations: 0,
};
function getPlannerCache(key: string) {
  const e = plannerCache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    plannerCache.delete(key);
    plannerMetrics.misses += 1;
    return null;
  }
  plannerMetrics.hits += 1;
  return e.value;
}
function setPlannerCache(key: string, value: any, ttlMs = 1000 * 30) {
  plannerCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  plannerMetrics.sets += 1;
}

// Exported helper to invalidate planner cache entries by prefix (e.g., user or conversation)
export function invalidatePlannerCacheByPrefix(prefix: string) {
  for (const k of Array.from(plannerCache.keys())) {
    if (k.startsWith(prefix)) {
      plannerCache.delete(k);
      plannerMetrics.invalidations += 1;
    }
  }
}

// Exported helper to clear entire planner cache (dev/testing)
export function clearPlannerCache() {
  plannerCache.clear();
}

// Expose simple metrics getters for observability (in-memory)
export function getPlannerMetrics() {
  return { ...plannerMetrics };
}

export function resetPlannerMetrics() {
  plannerMetrics.hits = 0;
  plannerMetrics.misses = 0;
  plannerMetrics.sets = 0;
  plannerMetrics.invalidations = 0;
}

const plannerPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are an intelligent planning assistant for a grocery shopping system. You analyze requests and provide recommendations - you do NOT execute any actions.

AVAILABLE SPECIALIZED AGENTS AND THEIR CAPABILITIES:
- catalog: Product search, catalog browsing, finding products, availability checks, product information
- cart_and_checkout: Adding/removing items from cart, viewing cart contents, cart management (for simple cart operations)
- deals: Finding deals, promotions, discounts, special offers, price comparisons, checking for savings on specific products
- payment: Processing payments, payment methods, billing information, payment issues
- notification_agent: Order notifications, confirmations, status updates
- supervisor: Complex workflows requiring multiple agents, multi-step processes, deal confirmations

YOUR ROLE (PLANNING ONLY):
1. ANALYZE the user's request and determine the appropriate handling approach
2. RECOMMEND either:
   - direct_response: For simple greetings, general advice, or basic questions
   - delegate: For specialized tasks requiring agent assistance
3. PROVIDE reasoning for your recommendation

IMPORTANT: You only provide recommendations. The supervisor makes all actual routing decisions.

KEY ANALYSIS PATTERNS:
- Questions about deals, discounts, promotions, savings, special offers → recommend deals agent
- Product search, finding items, browsing catalog → recommend catalog agent
- Cart operations (add, view, remove items) → recommend supervisor for workflow management
- Payment and billing → recommend payment agent
- Complex multi-step queries combining deals + cart operations → recommend supervisor for orchestration
- Conditional requests (e.g., "if there are deals, then add to cart") → recommend supervisor for workflow management
- Requests involving multiple actions or decision points → recommend supervisor for multi-agent coordination

ANALYSIS EXAMPLES:
- "Hello" → RECOMMEND: direct_response (simple greeting)
- "What are your store hours?" → RECOMMEND: direct_response (general information)
- "How do I cook pasta?" → RECOMMEND: direct_response (general cooking advice)
- "Find organic apples" → RECOMMEND: delegate to catalog (product search)
- "What deals are available today?" → RECOMMEND: delegate to deals (deal discovery)
- "Check deals for milk" → RECOMMEND: delegate to deals (specific deal inquiry)
- "Find promotions on vegetables" → RECOMMEND: delegate to deals (promotion search)
- "Are there discounts on bread?" → RECOMMEND: delegate to deals (discount inquiry)
- "Show me special offers" → RECOMMEND: delegate to deals (offer browsing)
- "Add bananas to my cart" → RECOMMEND: delegate to supervisor (cart workflow management)
- "View my cart" → RECOMMEND: delegate to supervisor (cart operations)
- "Checkout my order" → RECOMMEND: delegate to supervisor (complex checkout process)
- "Complete my purchase" → RECOMMEND: delegate to supervisor (complex checkout process)
- "Update my payment method" → RECOMMEND: delegate to payment (payment management)
- "Send me order confirmation" → RECOMMEND: delegate to notification_agent (notifications)

## Complex Multi-Step Workflow Examples:
- "Can you check if there are deals for apples and if there is, add few to my cart" → RECOMMEND: delegate to supervisor (complex workflow: deals check + conditional cart addition)
- "Check for deals on bananas and add them to my cart if there's a good deal" → RECOMMEND: delegate to supervisor (complex workflow: deals evaluation + conditional cart action)
- "Look for discounts on milk and add 2 gallons if there are savings" → RECOMMEND: delegate to supervisor (complex workflow: discount check + conditional purchase)
- "Find promotions on vegetables and add some to cart if the price is good" → RECOMMEND: delegate to supervisor (complex workflow: promotion search + conditional cart action)
- "See if bread is on sale and add a loaf if it's discounted" → RECOMMEND: delegate to supervisor (complex workflow: sale check + conditional cart addition)

REMEMBER: You provide analysis and recommendations only. All actual routing is handled by the supervisor.`,
  ],
  ["placeholder", "{messages}"],
]);

const planner = async (state: any) => {
  console.log("---PLANNER---");
  const { messages } = state;

  // Build a lightweight cache key from recent messages + conversation context
  const userId = (state && state.userId) ? String((state as any).userId) : 'anon';
  const convId = (state && state.conversationId) ? String((state as any).conversationId) : 'global';
  const key = `${userId}:${convId}:${messages.slice(-6).map((m: any) => typeof m.message.content === 'string' ? m.message.content : JSON.stringify(m.message)).join('|')}`;
  const cached = getPlannerCache(key);
  if (cached) {
    console.log('[planner] Returning cached plan');
    return cached;
  }

  // Build a compact prompt asking for a strict JSON planning recommendation. We include
  // a short system instruction and the last few messages as context.
  const promptMessages = [
    new SystemMessage(
      `You are a planning assistant that analyzes requests and provides recommendations (NOT executable actions).\n` +
        `Return strictly valid JSON with the following schema: { action: string, recommendedAgent?: string, task?: string, confidence: number, reasoning: string }\n` +
        `action must be one of: direct_response, delegate. confidence between 0 and 1.\n` +
        `CRITICAL: You only provide recommendations. The supervisor makes all actual routing decisions.`
    ),
    ...messages.slice(-6).map((m: any) => m.message).filter(Boolean),
  ];

    const response = await getPlannerLlm().invoke(promptMessages);
  console.log("[planner] Raw LLM response:", JSON.stringify(response, null, 2));

  // Try to parse JSON output from the LLM. If parsing fails, fall back to a
  // conservative recommendation to supervisor with low confidence.
  let plan: { action: string; recommendedAgent?: string; targetAgent?: string; task?: string; confidence: number; reasoning: string } | null = null;
  const textContent = response && typeof (response as any).content === 'string' ? (response as any).content : '';
  const text = textContent || JSON.stringify(response || '');
  try {
    // Extract first JSON object from text if necessary
    const jsonStart = text.indexOf('{');
    const jsonText = jsonStart >= 0 ? text.slice(jsonStart) : text;
    plan = JSON.parse(jsonText);
  } catch (e) {
    console.error('[planner] Failed to parse plan JSON, returning fallback recommendation', e);
    plan = {
      action: 'delegate',
      targetAgent: 'supervisor', // Using targetAgent for backward compatibility
      task: text.slice(0, 1000),
      confidence: 0.5,
      reasoning: 'Could not parse JSON plan from planner LLM; recommending supervisor.'
    };
  }

  // Ensure plan object exists and normalize
  if (!plan) {
    plan = {
      action: 'delegate',
      targetAgent: 'supervisor', // Using targetAgent for backward compatibility
      task: text.slice(0, 1000),
      confidence: 0.5,
      reasoning: 'Planner returned no plan; recommending supervisor.'
    };
  }

  plan.confidence = Math.max(0, Math.min(1, (plan.confidence as number) || 0.5));
  plan.action = (plan.action as string) || 'delegate';
  plan.reasoning = (plan.reasoning as string) || '';
  // Runtime JSON-schema validation & normalization for planner recommendation
  function validateAndNormalizePlan(input: any) {
    const allowedActions = ['direct_response', 'delegate'];
    const allowedAgents = ['catalog', 'cart_and_checkout', 'deals', 'payment', 'notification_agent', 'supervisor'];
    if (!input || typeof input !== 'object') {
      return {
        valid: false,
        plan: {
          action: 'delegate',
          targetAgent: 'supervisor', // Using targetAgent for backward compatibility
          task: typeof input === 'string' ? input.slice(0, 1000) : JSON.stringify(input).slice(0, 1000),
          confidence: 0.5,
          reasoning: 'Invalid planner output format'
        }
      };
    }

    const rawAction = typeof input.action === 'string' ? input.action.toLowerCase() : undefined;
    if (!rawAction || !allowedActions.includes(rawAction)) {
      return {
        valid: false,
        plan: {
          action: 'delegate',
          targetAgent: 'supervisor', // Using targetAgent for backward compatibility
          task: (input.task && String(input.task).slice(0, 1000)) || JSON.stringify(input).slice(0, 1000),
          confidence: 0.5,
          reasoning: 'Planner returned invalid or missing action'
        }
      };
    }

    // Handle both old 'targetAgent' and new 'recommendedAgent' for compatibility
    const rawTarget = typeof input.recommendedAgent === 'string' ? input.recommendedAgent : 
                     typeof input.targetAgent === 'string' ? input.targetAgent : undefined;
    const normalizedPlan: any = {
      action: rawAction,
      targetAgent: allowedAgents.includes(String(rawTarget)) ? rawTarget : 'supervisor', // Using targetAgent for backward compatibility
      task: typeof input.task === 'string' ? input.task : (input.task ? String(input.task) : undefined),
      confidence: typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : 0.5,
      reasoning: typeof input.reasoning === 'string' ? input.reasoning : (input.reasoning ? String(input.reasoning) : '')
    };

    // If direct_response, ensure there's at least some text in 'task' or 'reasoning'
    if (normalizedPlan.action === 'direct_response' && !normalizedPlan.task && !normalizedPlan.reasoning) {
      normalizedPlan.action = 'delegate';
      normalizedPlan.targetAgent = 'supervisor'; // Using targetAgent for backward compatibility
      normalizedPlan.confidence = Math.min(normalizedPlan.confidence, 0.6);
      normalizedPlan.reasoning = 'Converted to delegate because direct_response lacked content';
      return { valid: false, plan: normalizedPlan };
    }

    return { valid: true, plan: normalizedPlan };
  }

  const { valid, plan: finalPlan } = validateAndNormalizePlan(plan);

  // Package as an AIMessage with planning recommendation (not executable delegation)
  // The planner only provides recommendations - supervisor handles all delegation
  const normalized = new AIMessage(JSON.stringify(finalPlan));

  const resultPayload = {
    messages: [
      {
        message: normalized,
        role: 'assistant',
        agent: 'planner',
        timestamp: Date.now(),
        planningRecommendation: finalPlan, // Changed from 'delegation' to 'planningRecommendation'
      },
    ],
  };

  // Cache the normalized planner output for short-term reuse
  try {
    setPlannerCache(key, resultPayload, 1000 * 30);
  } catch (e) {
    console.warn('[planner] Failed to set cache', e);
  }

  return resultPayload;
};

export { planner };

// Test helpers
export function __setPlannerLlmForTests(mock: any) {
  plannerLlm = mock;
}

export function __resetPlannerLlmForTests() {
  plannerLlm = null;
}
