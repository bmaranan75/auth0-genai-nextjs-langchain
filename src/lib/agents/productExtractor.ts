import { SystemMessage } from '@langchain/core/messages';

type ExtractResult = { product: string; quantity?: number } | null;

type CacheEntry = { value: any; expiresAt: number };
const productCache = new Map<string, CacheEntry>();
const DEFAULT_TTL = 30 * 1000; // 30s

export function __clearProductExtractorCacheForTests() {
  productCache.clear();
}

function getCached(key: string) {
  const e = productCache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    productCache.delete(key);
    return null;
  }
  return e.value;
}

function setCached(key: string, value: any, ttl = DEFAULT_TTL) {
  productCache.set(key, { value, expiresAt: Date.now() + ttl });
}

/**
 * Extract product info using an injected LLM client.
 * The LLM client must implement `invoke(messages)` returning { content: string }.
 * This function requires an llm parameter in order to avoid hidden dependencies.
 */
export async function extractProductInfo(content: string, llm: any): Promise<ExtractResult> {
  if (!llm) throw new Error('extractProductInfo requires an llm instance');
  const cacheKey = `extractProduct:${String(content || '').slice(0, 1000)}`;
  const cached = getCached(cacheKey);
  if (cached) return JSON.parse(JSON.stringify(cached));

  const extractionPrompt = new SystemMessage(`Extract product information from this user message.

Look for:
- Product name (e.g., "bananas", "milk", "bread")
- Quantity if mentioned (e.g., "5", "some", "a few")

Return ONLY a JSON object:
{
  "product": string | null,
  "quantity": number | null
}

If no clear product is mentioned, return {"product": null, "quantity": null}

User message: "${content}"`);

  try {
    const response = await llm.invoke([extractionPrompt]);
    const text = response && typeof response.content === 'string' ? response.content : String(response || '');
    // Try parse first JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let parsed: any = null;
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch (_) { parsed = null; }
    }
    if (!parsed) {
      try { parsed = JSON.parse(text); } catch (_) { parsed = null; }
    }

    if (parsed && parsed.product) {
      const result = { product: parsed.product, quantity: parsed.quantity || undefined };
      setCached(cacheKey, result);
      return result;
    }
    setCached(cacheKey, null);
    return null;
  } catch (e) {
    // on error, cache null briefly to avoid thundering retries
    setCached(cacheKey, null, 5 * 1000);
    return null;
  }
}

export default extractProductInfo;
