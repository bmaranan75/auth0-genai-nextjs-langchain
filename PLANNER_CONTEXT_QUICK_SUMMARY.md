# Planner Context Awareness - Quick Summary

## What Changed

### Problem

```
User: "Check deals on apples and add 5 to cart"
Bot: Shows deal, asks "Would you like to apply?"
User: "yes"
Planner: Sees only "yes" → No context → Treats as new conversation ❌
```

### Solution: Two-Layer Defense

#### Layer 1: Early Context Check (Supervisor)

```typescript
// BEFORE planner runs
if (workflowContext === 'awaiting_deal_confirmation' && pendingProduct) {
  if (detectAffirmative(message)) {
    return {next: 'cart_and_checkout'}; // ✅ Fast & deterministic
  }
}
```

#### Layer 2: Context-Aware Planner (Fallback)

```typescript
// Planner now receives state context
const planner = async state => {
  const {messages, workflowContext, pendingProduct, dealData} = state;

  // Pass to LLM prompt
  await plannerPrompt.invoke({
    messages,
    workflowContext: workflowContext || 'none',
    pendingProduct: pendingProduct ? `${product} (qty: ${qty})` : 'none',
    dealStatus: dealData?.pending ? 'pending' : 'none',
  });
};
```

### Planner Prompt Enhancement

```
CURRENT CONVERSATION STATE:
- Workflow Context: {workflowContext}
- Pending Product: {pendingProduct}
- Deal Status: {dealStatus}

CONTEXT AWARENESS RULES:
- If workflowContext="awaiting_deal_confirmation" and user says yes/no → ALWAYS delegate
- If pendingProduct exists → User in transaction, delegate
- If dealStatus="pending" → User considering deal, delegate
```

## Architecture

```
User Input
    ↓
┌─────────────────────────────────────┐
│ LAYER 1: Supervisor Early Checks    │
│ • awaiting_deal_confirmation        │ ← Deterministic
│ • add_to_cart_with_deals           │ ← Fast
│ → Skip planner if match            │
└───────────┬─────────────────────────┘
            ↓ (no match)
┌─────────────────────────────────────┐
│ LAYER 2: Context-Aware Planner      │
│ Receives:                           │
│ • messages (conversation history)   │ ← LLM classification
│ • workflowContext (current state)   │ ← With context
│ • pendingProduct (transaction data) │ ← Informed decision
│ • dealData (deal status)            │
└───────────┬─────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│ LAYER 3: Supervisor Business Logic  │
│ • Validates planner output          │ ← Safety
│ • Applies routing rules             │ ← Orchestration
│ • Handles edge cases                │
└─────────────────────────────────────┘
```

## Benefits

### ⚡ Performance

- **Early checks** → 0ms (no LLM call)
- **Context-aware planner** → Better classification → Less back-and-forth

### 🎯 Accuracy

- **Early checks** → 100% accurate for known patterns
- **Context-aware planner** → Higher confidence scores

### 🛡️ Reliability

- **Two-layer defense** → If planner misclassifies, early check catches it
- **Graceful degradation** → Works even without context (fallback)

## Example Flows

### Flow 1: Critical Path (Early Check) ⚡

```
State: awaiting_deal_confirmation
User: "yes"
  ↓
Supervisor: ✅ Early check matches
  ↓
Route: cart_and_checkout
Time: ~0ms (no LLM)
```

### Flow 2: Ambiguous (Context-Aware Planner) 🤖

```
State: none
User: "maybe add some milk"
  ↓
Supervisor: No early check match
  ↓
Planner: Gets context + message
  ↓
LLM: "Tentative cart addition"
  ↓
Returns: delegate (confidence: 0.82)
  ↓
Supervisor: Routes to deals/cart
Time: ~200ms (LLM call)
```

### Flow 3: Context Continuation 🔄

```
State: add_to_cart_with_deals, pendingProduct: milk
User: "make it 2"
  ↓
Supervisor: No critical early check
  ↓
Planner: Sees context "add_to_cart_with_deals" + "milk"
  ↓
LLM: "User modifying existing cart operation"
  ↓
Returns: delegate (confidence: 0.95)
  ↓
Supervisor: Routes to cart_and_checkout
  ↓
Cart: Updates quantity ✅
```

## Files Modified

### `/src/lib/agents/planner.ts`

- ✅ Enhanced prompt with context variables
- ✅ Extract workflowContext, pendingProduct, dealData
- ✅ Pass context to LLM invoke
- ✅ Updated cache key to include context

### `/src/lib/agents/supervisor.ts`

- ✅ Early check for awaiting_deal_confirmation
- ✅ Early check for add_to_cart_with_deals
- ✅ Removed duplicate checks after planner

## Cache Strategy

**Old (Stateless):**

```
key = userId:convId:messages
```

**New (Context-Aware):**

```
key = userId:convId:workflowContext:pendingProduct:dealStatus:messages
```

**Invalidation:**

```typescript
// When state changes significantly
if (workflowContext changed || dealData.applied) {
  invalidatePlannerCacheByPrefix(`${convId}:${userId}`);
}
```

## Testing

```bash
# Test early checks
npm test supervisor.continuationFlow.test.ts

# Test context-aware planner
npm test planner.contextAwareness.test.ts

# Integration test
User: "Check deals on apples and add 5"
Bot: "20% off! Apply?"
User: "yes"
Bot: "✅ Added 5 apples with 20% off"  # Should work now!
```

## Performance Targets

- **Early check hit rate:** >20% (critical paths)
- **Planner cache hit rate:** >40%
- **Avg planner confidence:** >0.85
- **Context override rate:** <5% (planner working well)

## Monitoring

```typescript
console.log('[supervisor] Early check HIT: awaiting_deal_confirmation');
console.log('[planner] Context: workflowContext=add_to_cart_with_deals');
console.log('[planner] Classification: delegate (confidence: 0.92)');
```

## Rollback Plan

If issues arise:

1. Disable early checks (comment out lines 736-768 in supervisor.ts)
2. Planner still has context awareness as fallback
3. Revert planner.ts to use only messages (remove context vars)

## Next Steps

1. **Monitor** confidence scores and early check hit rates
2. **Add metrics** to track planner performance
3. **Tune thresholds** based on real usage patterns
4. **Add more early checks** for other common workflows

## Date

October 19, 2025
