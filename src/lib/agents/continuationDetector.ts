import { SystemMessage, AIMessage, HumanMessage } from '@langchain/core/messages';
import { STRONG_AFFIRMATIVE_CONFIDENCE_THRESHOLD, OVERRIDE_AFFIRMATIVE_CONFIDENCE, FALLBACK_AFFIRMATIVE_CONFIDENCE, DEFAULT_LLM_CONFIDENCE } from './constants';

type AnnotatedMessage = any;

type Analysis = {
  isContinuation: boolean;
  continuationType: 'deal_confirmation' | 'checkout_flow' | 'add_to_cart' | 'general';
  targetAgent: string;
  confidence: number;
  reasoning?: string;
};

type CacheEntry = { value: any; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL = 30 * 1000;

export function __clearContinuationDetectorCacheForTests() {
  cache.clear();
}

function getCached(key: string) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    cache.delete(key);
    return null;
  }
  return e.value;
}

function setCached(key: string, value: any, ttl = DEFAULT_TTL) {
  cache.set(key, { value, expiresAt: Date.now() + ttl });
}

export async function detectContinuationIntent(message: string, messages: AnnotatedMessage[], workflowContext: string | undefined, dealData: any, pendingProduct: any, llm: any): Promise<Analysis> {
  if (!llm) throw new Error('detectContinuationIntent requires llm');

  const fingerprint = [
    String(message || '').slice(0, 1000),
    workflowContext || '',
    JSON.stringify(pendingProduct || {}).slice(0, 300),
    JSON.stringify(dealData || {}).slice(0, 300),
    messages.slice(-6).map(m => {
      const content = m?.message?.content || '';
      return typeof content === 'string' ? content : JSON.stringify(content);
    }).join('|').slice(0, 1000)
  ].join('||');

  const cacheKey = `continuation:${fingerprint}`;
  const cached = getCached(cacheKey);
  if (cached) return JSON.parse(JSON.stringify(cached));

  let contextInfo = '';
  if (workflowContext === 'awaiting_deal_confirmation' && dealData && pendingProduct) {
    contextInfo = `CRITICAL CONTEXT: User was offered a deal on ${pendingProduct.product} (qty: ${pendingProduct.quantity || 1}).`;
  } else if (workflowContext === 'prepare_checkout' || workflowContext === 'process_checkout') {
    contextInfo = `CONTEXT: User is in checkout flow (${workflowContext}).`;
  } else if (workflowContext === 'add_to_cart_with_deals') {
    contextInfo = `CONTEXT: User is adding items with deal considerations.`;
  } else if (pendingProduct) {
    contextInfo = `CONTEXT: Pending product: ${pendingProduct.product}.`;
  }

  const recentMessages = messages.slice(-6).map(msg => {
    const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? `${msg.agent || 'Assistant'}` : 'System';
    const content = msg?.message?.content || '';
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    return `${role}: ${contentStr.substring(0, 150)}${contentStr.length > 150 ? '...' : ''}`;
  }).join('\n');

  const analysisPrompt = new SystemMessage(`You are analyzing user intent for conversation continuity in a shopping system.

${contextInfo}

RECENT CONVERSATION:
${recentMessages}

Current message: "${message}"

Return JSON with keys: isContinuation (boolean), continuationType (deal_confirmation|checkout_flow|add_to_cart|general), targetAgent (catalog|cart_and_checkout|payment|deals), confidence (0-1), reasoning (string)`);

  try {
    const response = await llm.invoke([analysisPrompt]);
    const text = response && typeof response.content === 'string' ? response.content : String(response || '');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let parsed: any = null;
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch (_) { parsed = null; }
    }
    if (!parsed) {
      try { parsed = JSON.parse(text); } catch (_) { parsed = null; }
    }

    // Normalize and validate
    const out: Analysis = {
      isContinuation: !!(parsed && parsed.isContinuation),
      continuationType: parsed && parsed.continuationType ? parsed.continuationType : 'general',
      targetAgent: parsed && parsed.targetAgent ? parsed.targetAgent : 'catalog',
  confidence: Math.max(0, Math.min(1, (parsed && typeof parsed.confidence === 'number') ? parsed.confidence : DEFAULT_LLM_CONFIDENCE)),
      reasoning: parsed && parsed.reasoning ? parsed.reasoning : ''
    };

    // Critical override for strong affirmative in awaiting_deal_confirmation
    if (workflowContext === 'awaiting_deal_confirmation' && pendingProduct) {
      const messageWords = message.toLowerCase().trim().split(/\s+/);
      const affirmativePatterns = ['yes', 'sure', 'ok', 'okay', 'apply', 'take', 'sounds', 'great', 'perfect', 'good', 'deal', 'go'];
      const hasAffirmative = affirmativePatterns.some(pattern => messageWords.some(word => word.includes(pattern) || pattern.includes(word)));
      if (hasAffirmative && out.confidence < STRONG_AFFIRMATIVE_CONFIDENCE_THRESHOLD) {
        const override: Analysis = { isContinuation: true, continuationType: 'deal_confirmation', targetAgent: 'cart_and_checkout', confidence: OVERRIDE_AFFIRMATIVE_CONFIDENCE, reasoning: 'Strong affirmative detected' };
        setCached(cacheKey, override);
        return override;
      }
    }

    setCached(cacheKey, out);
    return out;
  } catch (e) {
    // Fallback heuristics
    if (workflowContext === 'awaiting_deal_confirmation') {
      const messageWords = message.toLowerCase().trim().split(/\s+/);
      const affirmativePatterns = ['yes', 'sure', 'ok', 'okay', 'apply', 'take', 'sounds', 'great', 'perfect', 'good', 'deal', 'go'];
      const hasAffirmative = affirmativePatterns.some(pattern => messageWords.some(word => word.includes(pattern) || pattern.includes(word)));
      if (hasAffirmative) {
        const fallback: Analysis = { isContinuation: true, continuationType: 'deal_confirmation', targetAgent: 'cart_and_checkout', confidence: FALLBACK_AFFIRMATIVE_CONFIDENCE, reasoning: 'Fallback affirmative heuristic' };
        setCached(cacheKey, fallback);
        return fallback;
      }
    }
    const fallbackDefault: Analysis = { isContinuation: false, continuationType: 'general', targetAgent: 'catalog', confidence: 0.1, reasoning: 'Error in analysis' };
    setCached(cacheKey, fallbackDefault);
    return fallbackDefault;
  }
}

export default detectContinuationIntent;
