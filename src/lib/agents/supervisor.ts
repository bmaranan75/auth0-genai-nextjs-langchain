/**
 * CLEANED SUPERVISOR AGENT
 * 
 * This supervisor implements intelligent agent routing with LLM-based continuation detection.
 * 
 * Key Features:
 * - LLM-powered intent analysis for natural conversation flow
 * - Smart continuation detection for deal confirmations and checkout flows
 * - Simplified workflow management using context state
 * - Streamlined agent delegation without hardcoded keywords
 * 
 * Architecture:
 * - detectContinuationIntent(): Uses LLM to analyze user responses in context
 * - supervisor(): Main routing function with confidence-based decision making
 * - Agent nodes: Simplified handlers that focus on core functionality
 * 
 * Workflow Contexts:
 * - 'awaiting_deal_confirmation': User considering a deal offer
 * - 'add_to_cart_with_deals': Adding item with deal context
 * - 'check_deals': Checking for deals before adding to cart
 * - 'prepare_checkout'/'process_checkout': Checkout flow states
 */

import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { planner, invalidatePlannerCacheByPrefix } from './planner';
import { MIN_PLANNER_CONFIDENCE, MIN_CONTINUATION_CONFIDENCE, SUPERVISOR_LLM_CACHE_TTL_MS } from './constants';
import { ToolNode } from '@langchain/langgraph/prebuilt';

// Annotated message wrapper so we know which agent produced/handled each message
type AgentRole = 'user' | 'assistant' | 'system';
interface AnnotatedMessage {
  message: HumanMessage | AIMessage | SystemMessage;
  role: AgentRole;
  agent?: string;        // e.g. 'catalog', 'cart_and_checkout', 'deals', 'payment'
  senderId?: string;     // optional identifier of agent or external source
  timestamp: number;
  delegation?: {         // delegation information from planner
    targetAgent: string;
    task: string;
    reasoning: string;
  };
}

export const routePlanner = (state: typeof SupervisorState.State) => {
  const { messages, delegationDepth = 0 } = state as any;
  const lastMessage = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : null;

  console.log("[routePlanner] Processing planner response:", JSON.stringify(lastMessage, null, 2));

  const MAX_DELEGATION_DEPTH = 3;
  const MIN_CONFIDENCE = SAFE_MIN_PLANNER_CONFIDENCE; // planner must be somewhat confident before delegating

  // Check if this is a planner delegation
  if (lastMessage && lastMessage.delegation) {
    const delegation = lastMessage.delegation as any;

    // Basic schema validation (defensive)
    if (!delegation || typeof delegation !== 'object' || !delegation.targetAgent || typeof delegation.targetAgent !== 'string') {
      console.warn('[routePlanner] Invalid delegation object from planner, falling back to supervisor', delegation);
      return 'supervisor';
    }

    const { targetAgent, confidence } = delegation;
    console.log(`[routePlanner] Routing based on planner delegation to: ${targetAgent} (confidence: ${confidence})`);

    // Prevent delegation loops
    if ((delegationDepth as number) >= MAX_DELEGATION_DEPTH) {
      console.warn('[routePlanner] Max delegation depth exceeded, routing to supervisor');
      return 'supervisor';
    }

    // Validate that the target agent exists in our graph
    const validAgents = ["catalog", "cart_and_checkout", "deals", "payment", "notification_agent", "supervisor"];
    if (!validAgents.includes(targetAgent)) {
      console.warn(`[routePlanner] Invalid target agent: ${targetAgent}, falling back to supervisor`);
      return 'supervisor';
    }

    // Confidence guard: only delegate when above threshold
    if (typeof confidence === 'number' && confidence < MIN_CONFIDENCE) {
      console.warn(`[routePlanner] Planner confidence too low (${confidence}), routing to supervisor`);
      return 'supervisor';
    }

    // All checks passed — route to the requested agent
    // Increment delegation depth on the state so downstream nodes see it
    try {
      (state as any).delegationDepth = (delegationDepth as number) + 1;
      console.log(`[routePlanner] Incremented delegationDepth → ${(state as any).delegationDepth}`);
    } catch (e) {
      console.warn('[routePlanner] Could not increment delegationDepth on state', e);
    }
    return targetAgent;
  }

  // Check for tool calls in the message
  if (!lastMessage || !("message" in lastMessage) || !("tool_calls" in lastMessage.message) || !lastMessage.message.tool_calls || lastMessage.message.tool_calls.length === 0) {
    return END;
  }

  const toolName = lastMessage.message.tool_calls[0].name;

  if (toolName === "direct_response") {
    // For direct response, we can end here since the planner already has the final answer
    console.log("[routePlanner] Direct response - ending workflow");
    return END;
  }
  if (toolName === "delegate_to_agent") {
    // This should be handled by the delegation check above, but fallback to supervisor
    console.log("[routePlanner] Delegation tool call detected, routing to supervisor");
    return "supervisor";
  }
  if (toolName === "generate_plan") {
    return "supervisor";
  }
  return END;
};// Helper to wrap messages consistently
export function annotateMessage(msg: HumanMessage | AIMessage | SystemMessage, role: AgentRole, agent?: string, senderId?: string): AnnotatedMessage {
  return {
    message: msg,
    role,
    agent,
    senderId,
    timestamp: Date.now()
  };
}

// Build a compact context string for specialized agents.
// Include: recent user messages (always), system messages, and assistant messages produced by the same agent.
// Limit entries to avoid large payloads.
export function buildAgentContextMessage(
  annotatedMessages: Array<AnnotatedMessage>,
  targetAgent: string,
  currentUserMessage: string,
  maxEntries = 6
): string {
  const filtered = annotatedMessages
    .filter(m => {
      // Always include user messages and system messages
      if (m.role === 'user' || m.role === 'system') return true;
      // Include assistant messages only if produced by the target agent
      if (m.role === 'assistant' && m.agent === targetAgent) return true;
      return false;
    });

  // Deduplicate by message content while preserving the most recent occurrence order
  const seen = new Set<string>();
  const deduped: AnnotatedMessage[] = [];
  for (let i = filtered.length - 1; i >= 0; i--) {
    const m = filtered[i];
    const content = typeof m.message.content === 'string' ? m.message.content : JSON.stringify(m.message.content);
    if (!seen.has(content)) {
      seen.add(content);
      deduped.push(m);
    }
  }
  deduped.reverse();

  const recent = deduped.slice(-maxEntries); // take last N relevant entries

  // Compose lines with agent/source annotation to help the LLM quickly contextualize
  const lines = recent.map(m => {
    const content = typeof m.message.content === 'string' ? m.message.content : JSON.stringify(m.message.content);
    const src = m.role === 'assistant' ? (m.agent || 'assistant') : (m.role === 'system' ? 'system' : 'user');
    return `${src.toUpperCase()}: ${content}`;
  });

  // Add the current user message at the end (most relevant) only if it's not already present
  const alreadyPresent = lines.some(l => l.includes(currentUserMessage));
  if (!alreadyPresent) {
    lines.push(`USER_LATEST: ${currentUserMessage}`);
  }

  // Keep the context compact
  return lines.join('\n\n');
}

/**
 * Normalize product names from plural/conversational form to product code format
 * This helps bridge the gap between how users speak and how products are stored
 */
function normalizeProductName(productName: string): string {
  const normalized = productName.toLowerCase().trim();
  
  // Common plural to singular mappings for grocery items
  const pluralToSingular: { [key: string]: string } = {
    'apples': 'apple',
    'bananas': 'banana', 
    'oranges': 'orange',
    'carrots': 'carrots', // already singular form in catalog
    'potatoes': 'potato',
    'tomatoes': 'tomato',
    'onions': 'onion',
    'eggs': 'egg',
    'breads': 'bread',
    'milks': 'milk',
    'cheeses': 'cheese',
    'yogurts': 'yogurt',
    'cereals': 'cereal'
  };
  
  // Return normalized form if mapping exists, otherwise return original
  const result = pluralToSingular[normalized] || normalized;
  console.log(`[normalizeProductName] ${productName} → ${result}`);
  return result;
}

/**
 * ENHANCED SUPERVISOR STATE
 * 
 * Robust state management with validation and intelligent merging:
 * - messages: Conversation history (limited to prevent memory bloat)
 * - next: Target agent for routing
 * - userId: User identification (with fallback validation)
 * - conversationId: Conversation instance identifier (with auto-generation)
 * - cartData: Cart state with intelligent merging
 * - workflowContext: Context validation for continuation scenarios
 * - dealData: Deal information with history preservation
 * - pendingProduct: Product info with structure validation
 */
const SupervisorState = Annotation.Root({
  messages: Annotation<Array<AnnotatedMessage>>({
    reducer: (x, y) => {
      const combined = x.concat(y);
      // Limit message history to prevent memory bloat (keep last 10 messages)
      return combined.slice(-10);
    },
  }),
  next: Annotation<string>({
    reducer: (x, y) => y ?? x ?? END,
  }),
  userId: Annotation<string>({
    reducer: (x, y) => {
      if (!y && !x) {
        console.warn('[SupervisorState] Missing userId - using default');
        return 'default-user';
      }
      return y ?? x;
    },
  }),
  conversationId: Annotation<string>({
    reducer: (x, y) => {
      if (!y && !x) {
        console.warn('[SupervisorState] Missing conversationId - generating default');
        return `conv-${Date.now()}`;
      }
      return y ?? x;
    },
  }),
  cartData: Annotation<any>({
    reducer: (x, y) => {
      // Merge cart data intelligently
      if (y === null) return null; // Explicit clear
      if (!y) return x; // No new data
      if (!x) return y; // First time
      // Merge objects
      return typeof y === 'object' && typeof x === 'object' ? { ...x, ...y } : y;
    },
  }),
  workflowContext: Annotation<string>({
    reducer: (x, y) => {
      // Validate workflow context
      const validContexts = [
        'awaiting_deal_confirmation',
        'add_to_cart_with_deals', 
        'check_deals',
        'prepare_checkout',
        'process_checkout'
      ];
      if (y && !validContexts.includes(y)) {
        console.warn(`[SupervisorState] Invalid workflow context: ${y}`);
        return x; // Keep previous valid context
      }
      return y ?? x;
    },
  }),
  dealData: Annotation<any>({
    reducer: (x, y) => {
      if (y === null) return null; // Explicit clear
      if (!y) return x;
      if (!x) return y;
      // Intelligent merge - preserve important fields
      return {
        ...x,
        ...y,
        // Preserve history of deal interactions
        history: [...(x.history || []), ...(y.history || [])]
      };
    },
  }),
  // Counter to prevent infinite delegation loops between planner and supervisor
  delegationDepth: Annotation<number>({
    reducer: (x, y) => {
      // Accept explicit resets
      if (y === null) return 0;
      const prev = typeof x === 'number' ? x : 0;
      const next = typeof y === 'number' ? y : prev;
      // Clamp to a sensible maximum to avoid overflow
      return Math.max(0, Math.min(next, 100));
    },
  }),
  pendingProduct: Annotation<any>({
    reducer: (x, y) => {
      if (y === null) return null; // Explicit clear
      if (!y) return x;
      // Validate product structure
      if (y && typeof y === 'object' && !y.product) {
        console.warn('[SupervisorState] Invalid pendingProduct structure:', y);
        return x;
      }
      return y;
    },
  }),
  // notificationData: stores payload for post-checkout notifications (e.g., order id, summary)
  notificationData: Annotation<any>({
    reducer: (x, y) => {
      if (y === null) return null; // Explicit clear
      if (!y) return x;
      if (!x) return y;
      return { ...x, ...y };
    },
  }),
});

// Lazily initialize a ChatOpenAI instance so tests without API keys don't throw at import time
let llm: any = null;
function getLlm() {
  if (llm) return llm;
  try {
    llm = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0, maxRetries: 2, timeout: 50000 });
    return llm;
  } catch (e) {
    // Minimal fallback implementation for tests - deterministic and safe
    llm = {
      invoke: async (msgs: any) => {
        // Return simple default responses depending on system message content
        const first = Array.isArray(msgs) && msgs[0];
        const sys = first && first.type === 'system' ? first.content : '';
        return { content: 'catalog' };
      }
    };
    return llm;
  }
}

// Helper to extract textual content from various LLM response shapes
function extractLlmText(response: any): string {
  if (!response) return '';
  if (typeof response === 'string') return response;
  if (typeof response.content === 'string') return response.content;
  if (response.text && typeof response.text === 'string') return response.text;
  const gen = (response.generations || response.choices || response.output || []);
  if (Array.isArray(gen) && gen.length > 0) {
    const first = gen[0];
    if (typeof first === 'string') return first;
    if (first.text) return first.text;
    if (first.message && typeof first.message.content === 'string') return first.message.content;
    if (first.output_text) return first.output_text;
  }
  try { return JSON.stringify(response); } catch (_) { return String(response); }
}

// Safe fallbacks for imported constants in case of runtime issues
const SAFE_MIN_PLANNER_CONFIDENCE = typeof MIN_PLANNER_CONFIDENCE === 'number' ? MIN_PLANNER_CONFIDENCE : 0.4;
const SAFE_MIN_CONTINUATION_CONFIDENCE = typeof MIN_CONTINUATION_CONFIDENCE === 'number' ? MIN_CONTINUATION_CONFIDENCE : 0.7;
const SAFE_SUPERVISOR_LLM_CACHE_TTL_MS = typeof SUPERVISOR_LLM_CACHE_TTL_MS === 'number' ? SUPERVISOR_LLM_CACHE_TTL_MS : 30 * 1000;

// LangGraph server configuration
const LANGGRAPH_SERVER_URL = 'http://localhost:2024';

import LangGraphClient, { conversationThreadMap, conversationThreadTimestamps, AgentCallOptions, AgentCallResult } from './langgraphClient';

// Clean up old conversation mappings (prevent memory leaks)
// Use TTL-based eviction to avoid clearing active sessions unexpectedly.
setInterval(() => {
  const TTL = 60 * 60 * 1000; // 1 hour
  const now = Date.now();
  for (const [convId, ts] of conversationThreadTimestamps.entries()) {
    if (now - ts > TTL) {
      conversationThreadTimestamps.delete(convId);
      conversationThreadMap.delete(convId);
      console.log(`[supervisor] Evicted stale conversation: ${convId}`);
    }
  }
  // Occasional logging for visibility
  if (conversationThreadMap.size > 0) {
    console.log(`[supervisor] Active thread mappings: ${conversationThreadMap.size}`);
  }
}, 10 * 60 * 1000); // run every 10 minutes

// Create a singleton LangGraphClient to reuse connections across calls
const globalLangGraphClient = new LangGraphClient(LANGGRAPH_SERVER_URL);

// Internal mutable implementation reference so tests can inject mocks
let callLangGraphAgentImpl: (opts: AgentCallOptions) => Promise<AgentCallResult> = async (opts) => {
  return globalLangGraphClient.callAgentWithStream(opts);
};

// Public exported wrapper (immutable binding) that delegates to the mutable impl
export async function callLangGraphAgent(opts: AgentCallOptions): Promise<AgentCallResult> {
  return callLangGraphAgentImpl(opts);
}

// Test helper to override the internal LangGraph agent caller
export function __setCallLangGraphAgentForTests(fn: any) {
  callLangGraphAgentImpl = fn;
}

export function __resetCallLangGraphAgentForTests() {
  callLangGraphAgentImpl = async (opts: AgentCallOptions) => globalLangGraphClient.callAgentWithStream(opts);
}

// LangGraphClient implementation was extracted to src/lib/agents/langgraphClient.ts

// Enhanced product information extraction using LLM
// Safely parse JSON blocks returned by LLMs (tries direct parse, then extracts first JSON object)
export function safeParseJson<T = any>(text: string): T | null {
  if (!text || typeof text !== 'string') return null;
  try {
    return JSON.parse(text) as T;
  } catch (_e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch (_e2) {
      return null;
    }
  }
}

import extractProductInfoImpl from './productExtractor';
import detectContinuationIntentImpl from './continuationDetector';

// Backwards-compatible wrappers so existing tests and external callers can still
// call supervisor.extractProductInfo(...) and supervisor.detectContinuationIntent(...)
export async function extractProductInfo(content: string) {
  // Supervisor-level LLM response cache to avoid duplicate LLM calls across quick retries
  const key = `extract:${String(content || '').slice(0, 1000)}`;
  const cached = getSupervisorLlmCache(key);
  if (cached !== undefined) return JSON.parse(JSON.stringify(cached));

  const res = await extractProductInfoImpl(content, getLlm());
  setSupervisorLlmCache(key, res);
  return res;
}

export async function detectContinuationIntent(message: string, messages: Array<AnnotatedMessage>, workflowContext?: string, dealData?: any, pendingProduct?: any) {
  // Build a fingerprint to cache continuation analyses
  const fingerprint = [
    String(message || '').slice(0, 1000),
    workflowContext || '',
    JSON.stringify(pendingProduct || {}).slice(0, 300),
    JSON.stringify(dealData || {}).slice(0, 300),
    messages.slice(-6).map(m => (typeof m.message.content === 'string' ? m.message.content : JSON.stringify(m.message.content))).join('|').slice(0, 1000)
  ].join('||');

  const key = `continuation:${fingerprint}`;
  const cached = getSupervisorLlmCache(key);
  if (cached !== undefined) return JSON.parse(JSON.stringify(cached));

  const res = await detectContinuationIntentImpl(message, messages, workflowContext, dealData, pendingProduct, getLlm());
  setSupervisorLlmCache(key, res);
  return res;
}

// ===== Supervisor-level LLM response cache (simple TTL) =====
type SupCacheEntry = { value: any; expiresAt: number };
const supervisorLlmCache = new Map<string, SupCacheEntry>();
const SUP_CACHE_TTL = SUPERVISOR_LLM_CACHE_TTL_MS; // 30s default

function getSupervisorLlmCache(key: string) {
  const e = supervisorLlmCache.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) {
    supervisorLlmCache.delete(key);
    return undefined;
  }
  return e.value;
}

function setSupervisorLlmCache(key: string, value: any, ttl = SUP_CACHE_TTL) {
  supervisorLlmCache.set(key, { value, expiresAt: Date.now() + ttl });
}

export function __clearSupervisorLlmCacheForTests() {
  supervisorLlmCache.clear();
}

export function __setSupervisorLlmCacheEntryForTests(key: string, value: any, ttlMs?: number) {
  setSupervisorLlmCache(key, value, ttlMs);
}

export function invalidateSupervisorLlmCacheByPrefix(prefix: string) {
  for (const k of Array.from(supervisorLlmCache.keys())) {
    if (k.startsWith(prefix)) {
      supervisorLlmCache.delete(k);
    }
  }
}

// Supervisor function to route requests
async function supervisor(state: typeof SupervisorState.State) {
  const { messages, userId, conversationId, cartData, workflowContext, dealData, pendingProduct } = state;
  const lastAnnotated = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : undefined;
  const messageContent = lastAnnotated && lastAnnotated.message
    ? (typeof lastAnnotated.message.content === 'string' ? lastAnnotated.message.content : String(lastAnnotated.message.content))
    : '';
  
  console.log(`[supervisor] Current workflow context: ${workflowContext}`);
  console.log(`[supervisor] Cart data available: ${!!cartData}`);
  console.log(`[supervisor] Deal data available: ${!!dealData}`);
  console.log(`[supervisor] Pending product: ${!!pendingProduct}`);
  
  // Enhanced continuation detection
  const continuationAnalysis = await detectContinuationIntent(messageContent, messages, workflowContext, dealData, pendingProduct);
  
  console.log(`[supervisor] Continuation analysis:`, continuationAnalysis);
  
  // Handle continuation scenarios based on LLM analysis
  if (continuationAnalysis.isContinuation && continuationAnalysis.confidence > MIN_CONTINUATION_CONFIDENCE) {
    console.log(`[supervisor] High-confidence continuation detected: ${continuationAnalysis.continuationType}`);
    console.log(`[supervisor] Routing to: ${continuationAnalysis.targetAgent} with confidence: ${continuationAnalysis.confidence}`);
    
    switch (continuationAnalysis.continuationType) {
      case 'deal_confirmation':
        return {
          next: 'cart_and_checkout',
          userId,
          conversationId,
          workflowContext: 'add_to_cart_with_deals',
          dealData,
          pendingProduct,
    messages: lastAnnotated ? [lastAnnotated] : [] // Preserve the user's response message if present
        };
        
      case 'checkout_flow':
        return {
          next: 'cart_and_checkout',
          userId,
          conversationId,
          workflowContext: cartData ? 'process_checkout' : 'prepare_checkout',
          cartData,
          messages: lastAnnotated ? [lastAnnotated] : []
        };
        
      case 'add_to_cart':
        return {
          next: pendingProduct ? 'cart_and_checkout' : 'deals',
          userId,
          conversationId,
          workflowContext: pendingProduct ? 'add_to_cart_with_deals' : 'check_deals',
          dealData,
          pendingProduct,
    messages: lastAnnotated ? [lastAnnotated] : []
        };
    }
  }
  
  // CRITICAL: Handle specific workflow contexts before falling back to general routing
  if (workflowContext === 'add_to_cart_with_deals' && pendingProduct) {
    console.log(`[supervisor] OVERRIDE: Detected add_to_cart_with_deals context with pending product, routing directly to cart_and_checkout`);
    return {
      next: 'cart_and_checkout',
      userId,
      conversationId,
      workflowContext: 'add_to_cart_with_deals',
      dealData,
      pendingProduct,
  messages: lastAnnotated ? [lastAnnotated] : []
    };
  }
  
  if (workflowContext === 'awaiting_deal_confirmation' && pendingProduct) {
    console.log(`[supervisor] OVERRIDE: Detected awaiting_deal_confirmation context, checking for affirmative response`);
    // Robust affirmative detection as fallback
    const messageWords = messageContent.toLowerCase().trim().split(/\s+/);
    const affirmativePatterns = [
      'yes', 'sure', 'ok', 'okay', 'apply', 'take', 
      'sounds', 'great', 'perfect', 'good', 'deal', 'go'
    ];
    
    const hasAffirmative = affirmativePatterns.some(pattern => 
      messageWords.some(word => word.includes(pattern) || pattern.includes(word))
    );
    
    if (hasAffirmative) {
      console.log(`[supervisor] OVERRIDE: Affirmative response detected, routing to cart_and_checkout with add_to_cart_with_deals context`);
      return {
        next: 'cart_and_checkout',
        userId,
        conversationId,
        workflowContext: 'add_to_cart_with_deals',
        dealData,
        pendingProduct,
  messages: [lastAnnotated]
      };
    }
  }
  
  // Enhanced routing with context awareness - fallback only when continuation fails
  console.log(`[supervisor] No high-confidence continuation detected (confidence: ${continuationAnalysis.confidence})`);
  console.log(`[supervisor] Falling back to general routing logic`);
  
  const systemMessage = new SystemMessage(`You are an intelligent supervisor routing customer requests in a grocery shopping system.

Available agents:
• **catalog** - Product discovery, search, browsing, recommendations
• **cart_and_checkout** - Cart operations, checkout, order completion  
• **payment** - Payment method management only
• **deals** - Deal discovery and application

Context awareness rules:
- For new product inquiries → catalog
- For cart actions (add/remove/view) → deals first (to check offers), then cart_and_checkout
- For checkout/purchase → cart_and_checkout
- For payment setup → payment
- For ambiguous requests → use conversation context to infer intent

CRITICAL: If there's ANY indication this is a continuation or response to a previous interaction:
- Check workflow context carefully
- Consider pending products and deal data
- Prefer continuation agents over new conversations

${workflowContext ? `Current workflow: ${workflowContext}` : ''}
${pendingProduct ? `Pending product: ${pendingProduct.product}` : ''}
${dealData ? 'Deal context available' : ''}

Respond with ONLY the agent name: catalog, cart_and_checkout, payment, or deals

User message: "${messageContent}"`);

  const invokeMessages = lastAnnotated?.message ? [systemMessage, lastAnnotated.message] : [systemMessage];
  const response = await getLlm().invoke(invokeMessages as any);
  const nextAgent = response.content.toString().trim().toLowerCase();
  
  // Validate and route
  const validAgents = ['catalog', 'cart_and_checkout', 'payment', 'deals'];
  const selectedAgent = validAgents.includes(nextAgent) ? nextAgent : 'catalog';
  
  console.log(`[supervisor] Routing to agent: ${selectedAgent}`);
  
  // Extract product information for deals routing (add-to-cart scenarios)
  let extractedProduct = pendingProduct;
  if (selectedAgent === 'deals' && !pendingProduct) {
  extractedProduct = await extractProductInfo(messageContent);
    console.log('[supervisor] Extracted product info for deals:', extractedProduct);
    // Invalidate planner cache if we just discovered a pending product — planner decisions may change
    try { invalidatePlannerCacheByPrefix(`${conversationId || 'global'}:${userId}`); } catch (e) { console.warn('[supervisor] Failed to invalidate planner cache', e); }
  }
  
  return {
    next: selectedAgent,
    userId,
    conversationId,
    workflowContext: selectedAgent === 'deals' && extractedProduct ? 'check_deals' : workflowContext,
    pendingProduct: extractedProduct || pendingProduct,
    dealData,
    cartData,
  messages: lastAnnotated ? [lastAnnotated] : []
  };
}

// Agent functions that use the state
async function catalogNode(state: typeof SupervisorState.State) {
  const { messages, userId, conversationId, workflowContext, dealData, pendingProduct, cartData } = state;
  
  console.log('[catalogNode] Processing with catalog agent for user:', userId, 'conversation:', conversationId);
  
  const lastAnnotated = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : undefined;
  const messageContent = lastAnnotated && lastAnnotated.message
    ? (typeof lastAnnotated.message.content === 'string' ? lastAnnotated.message.content : String(lastAnnotated.message.content))
    : '';

  // Build compact context for the catalog agent and send reduced history
  const catalogContext = buildAgentContextMessage(messages as AnnotatedMessage[], 'catalog', messageContent);
  const result = await callLangGraphAgent({ agentId: 'catalog', message: catalogContext, userId: userId || 'default-user', conversationId: conversationId || `conv-${userId || 'default'}-session` });

  // Annotate returned messages as coming from the catalog assistant
  const annotatedResponses = (result.messages || []).map((m: any) => annotateMessage(m as AIMessage, 'assistant', 'catalog'));

  return {
    messages: annotatedResponses,
    // PRESERVE ALL STATE - critical for workflow continuity
    userId,
    conversationId,
    workflowContext,
    dealData,
    pendingProduct,
    cartData,
    next: END,
  };
}

export async function cartAndCheckoutNode(state: typeof SupervisorState.State) {
  const { messages, userId, conversationId, workflowContext, dealData, pendingProduct, cartData } = state;
  
  console.log('[cartAndCheckoutNode] Processing with cart & checkout agent for user:', userId, 'conversation:', conversationId);
  console.log('[cartAndCheckoutNode] Workflow context:', workflowContext);
  console.log('[cartAndCheckoutNode] Deal data available:', !!dealData);
  console.log('[cartAndCheckoutNode] Deal data:', dealData);
  console.log('[cartAndCheckoutNode] Pending product:', pendingProduct);
  console.log('[cartAndCheckoutNode] Cart data:', cartData);
  console.log('[cartAndCheckoutNode] All messages:', messages.map(m => ({ role: m.role, content: typeof m.message.content === 'string' ? m.message.content : String(m.message.content).substring(0, 100) })));
  
  // Determine the message to send to the cart agent
  let messageToAgent: string;
  const lastAnnotated = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : undefined;
  const originalContent = lastAnnotated && lastAnnotated.message
    ? (typeof lastAnnotated.message.content === 'string' ? lastAnnotated.message.content : String(lastAnnotated.message.content))
    : '';
  
  // Extract the original user message to determine if this is a checkout request
  // Don't use planner routing messages which contain "cart_and_checkout" 
  const userMessages = messages.filter(m => m.role === 'user');
  const lastUserMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;
  const actualUserContent = lastUserMessage ? 
    (typeof lastUserMessage.message.content === 'string' ? lastUserMessage.message.content : String(lastUserMessage.message.content)) 
    : originalContent;
  
  // Check if this is a checkout request based on actual user intent, not planner routing
  const isCheckoutRequest = actualUserContent.toLowerCase().includes('checkout') || 
                           actualUserContent.toLowerCase().includes('buy') ||
                           actualUserContent.toLowerCase().includes('purchase') ||
                           workflowContext === 'process_checkout' ||
                           workflowContext === 'prepare_checkout';
  
  if (workflowContext === 'add_to_cart_with_deals' && pendingProduct) {
    // Handle add-to-cart with deal context - provide full context to agent
    // Normalize product name for cart operations (deals use plural, cart uses singular)
    const productForCart = normalizeProductName(pendingProduct.product);
    
    messageToAgent = `[userId:${userId}] User confirmed: "${originalContent}". Please add ${pendingProduct.quantity || 1} ${pendingProduct.product} to cart using productCode "${productForCart}" and userId "${userId}"`;
    
    if (dealData) {
      if (dealData.applied) {
        messageToAgent += ` with the ${dealData.type || 'available'} deal applied`;
      } else if (dealData.pending) {
        messageToAgent += ` and apply the ${dealData.type || 'available'} deal that was offered`;
      }
    }
    
    console.log('[cartAndCheckoutNode] Deal context message:', messageToAgent);
  } else if (isCheckoutRequest) {
    // For checkout requests, let the agent handle getting cart data and processing checkout
    if (cartData) {
      messageToAgent = `[userId:${userId}] User wants to checkout. Cart data: ${JSON.stringify(cartData)}. ${originalContent}`;
      console.log('[cartAndCheckoutNode] Checkout message with existing cart data prepared');
    } else {
      messageToAgent = `[userId:${userId}] User wants to checkout: "${originalContent}". Please get the current cart and process checkout.`;
      console.log('[cartAndCheckoutNode] Checkout message without cart data - agent will handle getting cart');
    }
  } else {
    // For other scenarios, use the actual user message with userId context
    messageToAgent = `[userId:${userId}] ${actualUserContent}`;
  }
  
  // Build compact context for cart agent and prepend detailed action instructions
  const cartContext = buildAgentContextMessage(messages as AnnotatedMessage[], 'cart_and_checkout', actualUserContent);

  // Only add structured checkout instruction for actual checkout requests
  const structuredInstruction = isCheckoutRequest 
    ? `\n\nWhen completing checkout, return ONLY a JSON object with this shape (no additional text):\n{\n  "checkoutStatus": "success" | "failure",\n  "orderId": string | null,\n  "summary": string | null,\n  "items": Array<any> | null,\n  "total": number | null\n}`
    : '';

  const fullCartMessage = `${cartContext}\n\n${messageToAgent}${structuredInstruction}`;
  const result = await callLangGraphAgent({ agentId: 'cart_and_checkout', message: fullCartMessage, userId: userId || 'default-user', conversationId: conversationId || `conv-${userId || 'default'}-session` });

  const annotatedResponses = (result.messages || []).map((m: any) => annotateMessage(m as AIMessage, 'assistant', 'cart_and_checkout'));
  
  // Check if the cart operation failed and suggest alternative
  const resultMessage = result.messages && result.messages.length > 0 ? result.messages[result.messages.length - 1] : null;
  const responseContent = resultMessage && resultMessage.content ? (typeof resultMessage.content === 'string' ? resultMessage.content : '') : (result.content || '');
  
  // Detect if product was not recognized
  const contentStr = typeof responseContent === 'string' ? responseContent : '';
  const productNotRecognized = contentStr.toLowerCase().includes('not recognizing the product') ||
                               contentStr.toLowerCase().includes('product not found') ||
                               contentStr.toLowerCase().includes('item not found');
  
  if (productNotRecognized && pendingProduct) {
    console.log('[cartAndCheckoutNode] Product not recognized, suggesting catalog search');
    
    // Create a helpful message suggesting catalog search
    const helpfulMessage = new AIMessage(`I couldn't find "${pendingProduct.product}" in our catalog. Let me help you find the right product. You can try searching for similar items or browse our catalog.`);
    
    // Invalidate planner cache for this conversation/user since deal/cart state changed
    try { invalidatePlannerCacheByPrefix(`${conversationId || 'global'}:${userId}`); } catch (e) { console.warn('[supervisor] Failed to invalidate planner cache', e); }

    return {
      messages: annotatedResponses ? [...annotatedResponses, annotateMessage(helpfulMessage, 'assistant', 'cart_and_checkout')] : [annotateMessage(helpfulMessage, 'assistant', 'cart_and_checkout')],
      userId,
      conversationId,
      workflowContext: null, // Clear workflow context to allow new interactions
      dealData: null, // Clear deal data since the product wasn't found
      pendingProduct: null, // Clear pending product
      cartData,
      next: END, // End this interaction, user can start fresh
    };
  }
  // Prefer structured JSON response from cart agent for checkout detection
  const structured = safeParseJson<{
    checkoutStatus?: 'success' | 'failure';
    orderId?: string | null;
    summary?: string | null;
    items?: any[] | null;
    total?: number | null;
  }>(contentStr);

  if (structured && structured.checkoutStatus) {
    if (structured.checkoutStatus === 'success') {
      console.log('[cartAndCheckoutNode] Structured checkout success detected with orderId:', structured.orderId);
      const notificationPayload = {
        userId,
        conversationId,
        summary: structured.summary || contentStr,
        cartData: structured.items || cartData,
        orderId: structured.orderId || null,
        total: structured.total || null,
        timestamp: Date.now()
      };

      // Invalidate planner cache - cart was cleared after checkout
      try { invalidatePlannerCacheByPrefix(`${conversationId || 'global'}:${userId}`); } catch (e) { console.warn('[supervisor] Failed to invalidate planner cache', e); }

      return {
        messages: annotatedResponses,
        userId,
        conversationId,
        workflowContext: null,
        dealData,
        pendingProduct: null,
        cartData: null, // clear cart after successful checkout
        notificationData: notificationPayload,
        next: 'notification_agent'
      };
    }

    if (structured.checkoutStatus === 'failure') {
      console.log('[cartAndCheckoutNode] Structured checkout failure detected');
      const failMessage = new AIMessage(`Checkout failed: ${structured.summary || 'Unknown reason'}`);
      return {
        messages: annotatedResponses ? [...annotatedResponses, annotateMessage(failMessage, 'assistant', 'cart_and_checkout')] : [annotateMessage(failMessage, 'assistant', 'cart_and_checkout')],
        userId,
        conversationId,
        workflowContext: null,
        dealData,
        pendingProduct: null,
        cartData,
        next: END
      };
    }
  }

  // Fallback: Inspect responseContent for confirmation of successful checkout using text heuristics.
  const checkoutSuccess = contentStr.toLowerCase().includes('checkout completed') ||
                          contentStr.toLowerCase().includes('order confirmed') ||
                          contentStr.toLowerCase().includes('payment successful') ||
                          contentStr.toLowerCase().includes('order placed');

  if (checkoutSuccess) {
    console.log('[cartAndCheckoutNode] Detected successful checkout (text fallback) - preparing notification');

    // Build a simple notification payload
    const notificationPayload = {
      userId,
      conversationId,
      summary: contentStr,
      cartData,
      timestamp: Date.now()
    };

    // Invalidate planner cache - cart was cleared after checkout
    try { invalidatePlannerCacheByPrefix(`${conversationId || 'global'}:${userId}`); } catch (e) { console.warn('[supervisor] Failed to invalidate planner cache', e); }

    return {
      messages: annotatedResponses,
      userId,
      conversationId,
      workflowContext: null,
      dealData,
      pendingProduct: null,
      cartData: null, // clear cart after successful checkout
      notificationData: notificationPayload,
      next: 'notification_agent'
    };
  }

  return {
    messages: annotatedResponses,
    // PRESERVE ALL STATE - critical for workflow continuity
    userId,
    conversationId,
    workflowContext,
    dealData,
    pendingProduct,
    cartData,
    next: END,
  };
}

async function dealsNode(state: typeof SupervisorState.State) {
  const { messages, userId, conversationId, workflowContext, pendingProduct, dealData, cartData } = state;
  
  console.log('[dealsNode] Processing with deals agent for user:', userId, 'conversation:', conversationId);
  console.log('[dealsNode] Workflow context:', workflowContext);
  console.log('[dealsNode] Pending product:', pendingProduct);
  
  // Determine message to send to deals agent
  const lastAnnotated = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : undefined;
  let messageToAgent = lastAnnotated && lastAnnotated.message
    ? (typeof lastAnnotated.message.content === 'string' ? lastAnnotated.message.content : String(lastAnnotated.message.content))
    : '';
  
  // If we don't have a pendingProduct, try to extract one from the message so
  // the deals agent has something to work with. Supervisor normally extracts
  // this earlier, but ensure robustness here as a fallback.
  let effectivePending = pendingProduct;
  if (!effectivePending) {
    try {
  const extracted = await extractProductInfo(messageToAgent || (typeof lastAnnotated?.message?.content === 'string' ? lastAnnotated.message.content : ''));
      if (extracted && extracted.product) {
        effectivePending = extracted;
        console.log('[dealsNode] Fallback extracted pending product:', effectivePending);
      } else {
        console.log('[dealsNode] No pending product could be extracted (fallback)');
      }
    } catch (e) {
      console.warn('[dealsNode] Error extracting product info in fallback:', e);
    }
  }

  if (effectivePending && workflowContext === 'check_deals') {
    messageToAgent = `User wants to add to cart: "${messageToAgent}". Check for deals on ${effectivePending.product}${effectivePending.quantity ? ` (quantity: ${effectivePending.quantity})` : ''}`;
  }
  
  const dealsContext = buildAgentContextMessage(messages as AnnotatedMessage[], 'deals', messageToAgent);
  const result = await callLangGraphAgent({ agentId: 'deals', message: dealsContext, userId: userId || 'default-user', conversationId: conversationId || `conv-${userId || 'default'}-session` });
  const annotatedResponses = (result.messages || []).map((m: any) => annotateMessage(m as AIMessage, 'assistant', 'deals'));
  // Analyze response for deal confirmation needs
  const responseMessages = annotatedResponses;
  const responseContent = result.content || 'No deals found';
  
  // Simple check for deal confirmation prompts
  const requiresConfirmation = responseContent.toLowerCase().includes('would you like') ||
                              responseContent.toLowerCase().includes('apply this deal') ||
                              responseContent.toLowerCase().includes('interested in') ||
                              responseContent.toLowerCase().includes('take advantage');
  
  if (requiresConfirmation) {
    // Deal found, waiting for user confirmation
    console.log('[dealsNode] Deal confirmation required, setting awaiting_deal_confirmation state');
    console.log('[dealsNode] Pending product:', pendingProduct);
    console.log('[dealsNode] Deal data will be:', { pending: true, response: responseContent });
    
    // Invalidate planner cache for this conversation/user since deal state changed (pending confirmation)
    try { invalidatePlannerCacheByPrefix(`${conversationId || 'global'}:${userId}`); } catch (e) { console.warn('[supervisor] Failed to invalidate planner cache', e); }

    return {
      messages: responseMessages,
      workflowContext: 'awaiting_deal_confirmation',
      dealData: { 
        ...dealData, // Preserve existing deal data
        pending: true, 
        response: responseContent, 
        type: 'product_deal' 
      },
      pendingProduct: effectivePending || pendingProduct,
      cartData, // Preserve cart data
      userId,
      conversationId,
      next: END,
    };
  } else {
    // Check if this is a "no deals available" scenario
    const noDealsAvailable = responseContent.toLowerCase().includes('no current deals') ||
                             responseContent.toLowerCase().includes('no deals available') ||
                             responseContent.toLowerCase().includes('expired') ||
                             responseContent.toLowerCase().includes('unfortunately, there are no');
    
    if (noDealsAvailable) {
      // No deals available - end workflow, let user decide next action
      console.log('[dealsNode] No deals available, ending workflow to allow user choice');
      // Invalidate planner cache for this conversation/user since dealData was updated
      try { invalidatePlannerCacheByPrefix(`${conversationId || 'global'}:${userId}`); } catch (e) { console.warn('[supervisor] Failed to invalidate planner cache', e); }

      return {
        messages: responseMessages,
        workflowContext: null, // Clear workflow context
        dealData: { 
          ...dealData,
          applied: false, 
          response: responseContent, 
          type: 'no_deals_found' 
        },
        pendingProduct: null, // Clear pending product since deals search is complete
        cartData,
        userId,
        conversationId,
        next: END,
      };
    } else {
      // No confirmation needed, proceed to add to cart
      // Invalidate planner cache for this conversation/user since dealData was applied/changed
      try { invalidatePlannerCacheByPrefix(`${conversationId || 'global'}:${userId}`); } catch (e) { console.warn('[supervisor] Failed to invalidate planner cache', e); }

      // If we somehow don't have an effective pending product, avoid routing
      // directly to cart_and_checkout and instead clear the pending product so
      // the supervisor or catalog can re-evaluate.
      if (!effectivePending) {
        console.log('[dealsNode] No pending product after deals processing — clearing pendingProduct and ending to let supervisor decide');
        return {
          messages: responseMessages,
          workflowContext: null,
          dealData: { 
            ...dealData,
            applied: true,
            response: responseContent,
            type: 'product_deal'
          },
          pendingProduct: null,
          cartData,
          userId,
          conversationId,
          next: END,
        };
      }

      return {
        messages: responseMessages,
        workflowContext: 'add_to_cart_with_deals',
        dealData: { 
          ...dealData, // Preserve existing deal data
          applied: true, 
          response: responseContent, 
          type: 'product_deal' 
        },
        pendingProduct: effectivePending,
        cartData, // Preserve cart data
        userId,
        conversationId,
        next: 'cart_and_checkout',
      };
    }
  }
}

async function paymentNode(state: typeof SupervisorState.State) {
  const { messages, userId, conversationId, cartData, workflowContext, dealData, pendingProduct } = state;
  
  console.log('[paymentNode] Processing with payment agent for user:', userId, 'conversation:', conversationId);
  console.log('[paymentNode] Workflow context:', workflowContext);
  
  const lastAnnotated = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : undefined;
  const messageContent = lastAnnotated && lastAnnotated.message
    ? (typeof lastAnnotated.message.content === 'string' ? lastAnnotated.message.content : String(lastAnnotated.message.content))
    : '';
  
  const paymentContext = buildAgentContextMessage(messages as AnnotatedMessage[], 'payment', messageContent);
  const result = await callLangGraphAgent({ agentId: 'payment', message: paymentContext, userId: userId || 'default-user', conversationId: conversationId || `conv-${userId || 'default'}-session` });
  const annotatedResponses = (result.messages || []).map((m: any) => annotateMessage(m as AIMessage, 'assistant', 'payment'));
  
  return {
    messages: annotatedResponses,
    // PRESERVE ALL STATE
    userId,
    conversationId,
    workflowContext,
    dealData,
    pendingProduct,
    cartData,
    next: END,
  };
}

// Simple Pushover client helper - uses fetch to call Pushover API
// Expects environment variables: PUSHOVER_TOKEN (application token), PUSHOVER_USER (user key)
import fetch from 'node-fetch';

let sendPushoverNotificationImpl: (payload: { title: string; message: string; user?: string; token?: string }) => Promise<any> = async (payload) => {
  const token = payload.token || process.env.PUSHOVER_TOKEN;
  const user = payload.user || process.env.PUSHOVER_USER;

  if (!token || !user) {
    console.warn('[notification_agent] Missing Pushover configuration (PUSHOVER_TOKEN/PUSHOVER_USER)');
    return { ok: false, error: 'Missing pushover config' };
  }

  const form = new URLSearchParams();
  form.append('token', token);
  form.append('user', user);
  form.append('title', payload.title);
  form.append('message', payload.message);

  try {
    const res = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      body: form
    });
    const json = await res.json();
    return { ok: res.ok, result: json };
  } catch (error) {
    console.error('[notification_agent] Error sending pushover notification:', error);
    return { ok: false, error };
  }
};

async function sendPushoverNotification(payload: { title: string; message: string; user?: string; token?: string }) {
  return sendPushoverNotificationImpl(payload);
}

export function __setSendPushoverNotificationForTests(fn: any) {
  sendPushoverNotificationImpl = fn;
}

export function __resetSendPushoverNotificationForTests() {
  sendPushoverNotificationImpl = async (payload) => {
    const token = payload.token || process.env.PUSHOVER_TOKEN;
    const user = payload.user || process.env.PUSHOVER_USER;
    if (!token || !user) return { ok: false, error: 'Missing pushover config' };
    const form = new URLSearchParams();
    form.append('token', token);
    form.append('user', user);
    form.append('title', payload.title);
    form.append('message', payload.message);
    try {
      const res = await fetch('https://api.pushover.net/1/messages.json', { method: 'POST', body: form });
      const json = await res.json();
      return { ok: res.ok, result: json };
    } catch (error) {
      return { ok: false, error };
    }
  };
}

async function notificationAgent(state: typeof SupervisorState.State) {
  const { notificationData, userId, conversationId } = state as any;

  console.log('[notificationAgent] Running notification agent for user:', userId, 'conversation:', conversationId);
  if (!notificationData) {
    console.log('[notificationAgent] No notificationData present - nothing to send');
    return {
      messages: [new AIMessage('No notification to send.')],
      userId,
      conversationId,
      workflowContext: null,
      notificationData: null,
      next: END
    };
  }

  const title = `Order Confirmation - ${userId}`;
  const message = `Your order was completed. Summary: ${notificationData.summary || "(no summary)"}`;

  const sendResult = await sendPushoverNotification({ title, message });

  const feedbackMessage = sendResult.ok
    ? new AIMessage('Notification sent successfully.')
    : new AIMessage(`Failed to send notification: ${sendResult.error || JSON.stringify(sendResult.result)}`);

  return {
    messages: [annotateMessage(feedbackMessage, 'assistant', 'notification_agent')],
    userId,
    conversationId,
    workflowContext: null,
    notificationData: null, // clear after sending
    next: END
  };
}

import { responseTool, planTool } from '../tools/routing';

// Build the graph
const toolNode = new ToolNode([responseTool, planTool]);

// Wrapper node to adapt our AnnotatedMessage[] state to the ToolNode input
// ToolNode expects either BaseMessage[] or { messages: BaseMessage[] } as input.
// Our SupervisorState stores messages as AnnotatedMessage[], so convert before
// invoking the ToolNode and then convert responses back into AnnotatedMessage.
async function toolsNode(state: typeof SupervisorState.State) {
  const annotated = Array.isArray(state.messages) ? state.messages : [];
  // Extract the underlying BaseMessage objects
  const baseMessages = annotated.map((m: any) => m && m.message).filter(Boolean);

  // Invoke the ToolNode with the proper shape
  // use { messages: baseMessages } because ToolNode accepts that form
  const result: any = await toolNode.invoke({ messages: baseMessages }, {});

  // Convert returned BaseMessages into our AnnotatedMessage wrapper
  const annotatedResponses = (result?.messages || []).map((m: any) => {
    // If the message is already an instance of a BaseMessage-like object, wrap it
    return annotateMessage(m as AIMessage, 'assistant');
  });

  return {
    messages: annotatedResponses,
    userId: state.userId,
    conversationId: state.conversationId,
    next: END,
  };
}

const workflow = new StateGraph(SupervisorState)
  .addNode('planner', planner)
  .addNode('supervisor', supervisor)
  .addNode('catalog', catalogNode)
  .addNode('cart_and_checkout', cartAndCheckoutNode)
  .addNode('notification_agent', notificationAgent)
  .addNode('payment', paymentNode)
  .addNode('deals', dealsNode)
  .addNode('tools', toolsNode)
  .addEdge(START, 'planner')
  .addConditionalEdges('planner', routePlanner, {
    [END]: END,
    supervisor: 'supervisor',
    tools: 'tools',
    catalog: 'catalog',
    cart_and_checkout: 'cart_and_checkout',
    deals: 'deals',
    payment: 'payment',
    notification_agent: 'notification_agent',
  })
  .addConditionalEdges('supervisor', (state) => state.next, {
    catalog: 'catalog',
    cart_and_checkout: 'cart_and_checkout',
    payment: 'payment',
    deals: 'deals',
  })
  .addEdge('tools', END)
  .addConditionalEdges('catalog', (state) => state.next, {
    supervisor: 'supervisor',
    [END]: END,
  })
  .addConditionalEdges('cart_and_checkout', (state) => state.next, {
    supervisor: 'supervisor',
    notification_agent: 'notification_agent',
    [END]: END,
  })
  .addConditionalEdges('deals', (state) => state.next, {
    supervisor: 'supervisor',
    cart_and_checkout: 'cart_and_checkout',
    [END]: END,
  })
  .addConditionalEdges('notification_agent', (state) => state.next, {
    supervisor: 'supervisor',
    [END]: END,
  })
  .addEdge('payment', END);

// Export a factory so callers can compile the workflow with a checkpointer/config.
export function compileSupervisorWorkflow(options?: any) {
  return workflow.compile(options);
}

// Backwards-compatible compiled graph export for LangGraph tooling (langgraph.json)
// This compiles a default instance without a per-agent checkpointer. For
// per-instance persistence, callers should use `compileSupervisorWorkflow`.
export const supervisorGraph = compileSupervisorWorkflow();

// Class-based Supervisor Agent with local state management
export class SupervisorAgent {
  private userId: string;
  private conversationId?: string;
  private memorySaver: MemorySaver;
  private compiledGraph: any;
  private threadPrefix: string;
  private lgClient: LangGraphClient;

  constructor(userId: string, conversationId?: string) {
    this.userId = userId;
    this.conversationId = conversationId;
    this.memorySaver = new MemorySaver();
  this.threadPrefix = `supervisor-${userId}`;
  // Reuse the module-level global LangGraphClient to avoid creating multiple connections
  this.lgClient = globalLangGraphClient;
    
    // Create compiled graph with optimized configuration using the compile factory
    this.compiledGraph = compileSupervisorWorkflow({ 
      checkpointer: this.memorySaver,
      // Add configuration for better state management
      interruptBefore: [], // Can add nodes to interrupt before if needed
      interruptAfter: []   // Can add nodes to interrupt after if needed
    });
    
    console.log('[SupervisorAgent] Initialized for userId:', userId, 'threadPrefix:', this.threadPrefix);
  }

  // CRITICAL FIX: Use consistent thread ID that matches remote agents
  private getThreadId(conversationId?: string): string {
    const effectiveConversationId = conversationId || this.conversationId || `conv-${this.userId}-session`;
    
    // Check if this conversation already has a mapped thread ID from remote agents
    const existingThreadId = conversationThreadMap.get(effectiveConversationId);
    if (existingThreadId) {
      console.log(`[SupervisorAgent] Using existing mapped thread: ${existingThreadId} for conversation: ${effectiveConversationId}`);
      return existingThreadId;
    }
    
    // Use supervisor-specific thread ID format for local graph execution
    return `supervisor-${effectiveConversationId}`;
  }

  // OPTIMIZED: Improved chat method with better state handling
  async chat(message: string, conversationId?: string): Promise<any> {
    const effectiveConversationId = conversationId || this.conversationId || `conv-${this.userId}-session`;
    const threadId = this.getThreadId(effectiveConversationId);

    console.log('[SupervisorAgent] Processing message with thread ID:', threadId);
    console.log('[SupervisorAgent] Effective conversation ID:', effectiveConversationId);

    try {
      // Ensure remote thread exists so LangGraph streaming and memory map work consistently
      await this.lgClient.ensureThread(effectiveConversationId, this.userId);

      // Annotate incoming user message so graph state uses AnnotatedMessage consistently
      const annotatedInput = annotateMessage(new HumanMessage(message), 'user');

      const result = await this.compiledGraph.invoke({
        messages: [annotatedInput],
        userId: this.userId,
        conversationId: effectiveConversationId,
        next: '',
      }, {
        configurable: { 
          thread_id: threadId,
          // Reduce recursion limit to prevent infinite loops
          recursion_limit: 5,
          max_execution_time: 60000 // 60 seconds
        }
      });

      // update timestamp for mapping
      conversationThreadTimestamps.set(effectiveConversationId, Date.now());

      return result;
    } catch (error) {
      console.error('[SupervisorAgent] Error in chat:', error);

      // Return graceful error response
      return {
        messages: [new AIMessage('I apologize, but I encountered an error processing your request. Please try again.')],
        userId: this.userId,
        conversationId: effectiveConversationId,
        next: END
      };
    }
  }

  // Enhanced stream support with better error handling
  async stream(message: string, conversationId?: string) {
    const effectiveConversationId = conversationId || this.conversationId || `conv-${this.userId}-session`;
    const threadId = this.getThreadId(effectiveConversationId);

    try {
      await this.lgClient.ensureThread(effectiveConversationId, this.userId);
      conversationThreadTimestamps.set(effectiveConversationId, Date.now());

      const annotatedInput = annotateMessage(new HumanMessage(message), 'user');

      return this.compiledGraph.stream({
        messages: [annotatedInput],
        userId: this.userId,
        conversationId: effectiveConversationId,
        next: '',
      }, {
        configurable: { 
          thread_id: threadId,
          recursion_limit: 5,
          max_execution_time: 60000
        }
      });
    } catch (error) {
      console.error('[SupervisorAgent] Error in stream:', error);
      throw error;
    }
  }

  // Enhanced LangGraph-compatible invoke method
  async invoke(input: { messages: any[], conversationId?: string }, config?: any) {
    const threadId = this.getThreadId(input.conversationId);
    
    const finalConfig = config || { configurable: { thread_id: threadId } };
    if (!finalConfig.configurable) {
      finalConfig.configurable = { thread_id: threadId };
    } else if (!finalConfig.configurable.thread_id) {
      finalConfig.configurable.thread_id = threadId;
    }
    
    // Add enhanced configuration
    finalConfig.configurable.recursion_limit = finalConfig.configurable.recursion_limit || 5;
    finalConfig.configurable.max_execution_time = finalConfig.configurable.max_execution_time || 60000;
    
    const effectiveConversationId = input.conversationId || this.conversationId || `conv-${this.userId}-session`;
    await this.lgClient.ensureThread(effectiveConversationId, this.userId);
    conversationThreadTimestamps.set(effectiveConversationId, Date.now());

    // Ensure incoming messages are annotated (if plain HumanMessage, wrap them)
    const annotatedMessages = input.messages.map(m => {
      if ((m as AnnotatedMessage).message) return m as AnnotatedMessage;
      // assume m is a HumanMessage/SystemMessage/AIMessage
      if (m instanceof HumanMessage) {
        return annotateMessage(m, 'user');
      }
      if (m instanceof SystemMessage) {
        return annotateMessage(m, 'system');
      }
      return annotateMessage(m as AIMessage, 'assistant');
    });

    return await this.compiledGraph.invoke({
      messages: annotatedMessages,
      userId: this.userId,
      conversationId: effectiveConversationId,
      next: '',
    }, finalConfig);
  }

  // NEW: Method to get current state/context
  async getCurrentState(conversationId?: string): Promise<any> {
    const effectiveConversationId = conversationId || this.conversationId || `conv-${this.userId}-session`;
    const threadId = this.getThreadId(effectiveConversationId);
    try {
      // Ensure thread exists remotely
      await this.lgClient.ensureThread(effectiveConversationId, this.userId);
      conversationThreadTimestamps.set(effectiveConversationId, Date.now());
      return await this.memorySaver.get({ configurable: { thread_id: threadId } });
    } catch (error) {
      console.error('[SupervisorAgent] Error getting current state:', error);
      return null;
    }
  }

  // ENHANCED: Better session clearing
  async clearSession(conversationId?: string): Promise<void> {
    const effectiveConversationId = conversationId || this.conversationId || `conv-${this.userId}-session`;
    const threadId = this.getThreadId(effectiveConversationId);
    try {
      // Remove from local maps
      conversationThreadMap.delete(effectiveConversationId);
      conversationThreadTimestamps.delete(effectiveConversationId);

      // Reset memory saver for this agent instance
      this.memorySaver = new MemorySaver();
      console.log('[SupervisorAgent] Cleared session for conversation:', effectiveConversationId, 'thread:', threadId);
    } catch (error) {
      console.error('[SupervisorAgent] Error clearing session:', error);
    }
  }

  // NEW: Get all active sessions for this user
  async getActiveSessions(): Promise<string[]> {
    try {
      // Return active conversation IDs for this user from the in-memory map
      const active: string[] = [];
      for (const [convId, threadId] of conversationThreadMap.entries()) {
        if (convId.includes(this.userId) || convId.includes(`conv-${this.userId}`) || threadId?.includes(this.userId)) {
          active.push(convId);
        }
      }
      return active;
    } catch (error) {
      console.error('[SupervisorAgent] Error getting active sessions:', error);
      return [];
    }
  }

  // NEW: Health check method
  async healthCheck(): Promise<{ status: string; userId: string; timestamp: number }> {
    return {
      status: 'healthy',
      userId: this.userId,
      timestamp: Date.now()
    };
  }
}

// Factory function for backward compatibility
export const createSupervisorAgent = (userId: string, conversationId?: string) => {
  return new SupervisorAgent(userId, conversationId);
};

// Export internal helpers for testing
export { notificationAgent, sendPushoverNotification, END };

// Test helpers - allow tests to inject a mock LLM when needed
// These are explicitly test-only helpers to avoid exposing mutable internals in production
export function __setLlmForTests(mock: any) {
  // @ts-ignore
  llm = mock;
}

export function __resetLlmForTests() {
  // @ts-ignore
  llm = null;
}