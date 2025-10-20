# Planner Memory Patterns - Context-Aware Routing

## Problem Statement

The planner was stateless - it only saw message history without conversation context. This caused issues like:

- User says "yes" → Planner doesn't know they're confirming a deal
- User says "no thanks" → Planner treats as new conversation
- Complex workflows lose continuity between steps

## Three Architecture Patterns for Planner Memory

### Pattern 1: Context-Aware Planner (✅ IMPLEMENTED)

**Approach:** Pass conversation state to the planner prompt as context variables

**Advantages:**

- ✅ Planner aware of workflow state
- ✅ Can make context-aware routing decisions
- ✅ No circular dependencies
- ✅ Maintains planner as pure classifier

**Implementation:**

#### 1. Enhanced Prompt Template

```typescript
const plannerPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `CURRENT CONVERSATION STATE (if provided):
    - Workflow Context: {workflowContext}
    - Pending Product: {pendingProduct}
    - Deal Status: {dealStatus}
    
    CONTEXT AWARENESS:
    - If workflowContext="awaiting_deal_confirmation" and user says yes/no → ALWAYS delegate
    - If pendingProduct exists → User in middle of transaction, delegate
    ...`,
  ],
]);
```

#### 2. Extract State in Planner

```typescript
const planner = async (state: any) => {
  const {messages, workflowContext, pendingProduct, dealData} = state;

  // Build context strings
  const contextString = workflowContext || 'none';
  const pendingProductString = pendingProduct
    ? `${pendingProduct.product} (qty: ${pendingProduct.quantity || 1})`
    : 'none';
  const dealStatusString = dealData?.pending ? 'pending' : 'none';

  // Pass to prompt
  response = await plannerPrompt.invoke({
    messages: extractedMessages,
    workflowContext: contextString,
    pendingProduct: pendingProductString,
    dealStatus: dealStatusString,
  });
};
```

#### 3. Updated Cache Key

```typescript
const contextKey = `${contextString}:${pendingProductString}:${dealStatusString}`;
const key = `${userId}:${convId}:${contextKey}:${messages...}`;
```

**When to Use:**

- ✅ Best for most scenarios
- ✅ When planner needs state awareness
- ✅ Clean separation: planner classifies, supervisor orchestrates

---

### Pattern 2: Early Context Check in Supervisor (✅ ALSO IMPLEMENTED)

**Approach:** Check critical contexts BEFORE calling planner

**Advantages:**

- ✅ Fastest (no LLM call for known patterns)
- ✅ Deterministic for critical flows
- ✅ Fallback when planner misclassifies

**Implementation:**

```typescript
async function supervisor(state) {
  const { workflowContext, pendingProduct, messages } = state;

  // EARLY CHECK: Handle critical contexts before planner
  if (workflowContext === 'awaiting_deal_confirmation' && pendingProduct) {
    const hasAffirmative = detectAffirmative(lastMessage);
    if (hasAffirmative) {
      return { next: 'cart_and_checkout', ... };
    } else {
      return { next: END, message: "No problem!", ... };
    }
  }

  // Now call planner for other scenarios
  const plannerResult = await planner(state);
  ...
}
```

**When to Use:**

- ✅ Critical workflow states (checkout, payment confirmation)
- ✅ When deterministic routing is required
- ✅ As safety net / fallback for planner

**Combination with Pattern 1:**

```
User says "yes" after deal offer
  ↓
1. Supervisor EARLY CHECK: detects awaiting_deal_confirmation ✅
   → Routes to cart (no planner call needed)

OR (if early check is disabled)
  ↓
2. Planner sees: workflowContext="awaiting_deal_confirmation"
   → Returns: { action: "delegate", confidence: 1.0 }
   → Supervisor routes appropriately ✅
```

---

### Pattern 3: Stateful Planner with Memory (❌ NOT RECOMMENDED)

**Approach:** Store planner-specific state/history between calls

**Disadvantages:**

- ❌ Adds complexity
- ❌ Duplicate state management
- ❌ Cache invalidation issues
- ❌ Planner should be pure function

**Example (don't use):**

```typescript
const plannerMemory = new Map(); // ❌ Avoid this

const planner = async state => {
  const history = plannerMemory.get(conversationId) || [];
  history.push(currentClassification);
  plannerMemory.set(conversationId, history);
  // Now planner has to manage its own state...
};
```

**Why Not to Use:**

- State is already in SupervisorState
- Creates two sources of truth
- Planner should be classifier, not orchestrator

---

## Recommended Architecture: Hybrid Approach ⭐

**Combine Pattern 1 + Pattern 2:**

```typescript
// LAYER 1: Early checks for critical paths (deterministic)
async function supervisor(state) {
  // Critical context checks BEFORE planner
  if (workflowContext === 'awaiting_deal_confirmation') {
    return handleDealConfirmation(state); // Deterministic
  }
  if (workflowContext === 'add_to_cart_with_deals') {
    return { next: 'cart_and_checkout', ... }; // Deterministic
  }

  // LAYER 2: Call context-aware planner for classification
  const plannerResult = await planner(state); // Has context

  // LAYER 3: Supervisor validates and applies business logic
  return applyBusinessLogic(plannerResult, state);
}
```

### Benefits:

1. **Fast** - Critical paths skip LLM
2. **Reliable** - Deterministic for important flows
3. **Flexible** - Planner handles ambiguous cases with context
4. **Maintainable** - Clear layering of concerns

---

## Example Flows

### Flow 1: Deal Confirmation (Using Early Check)

```
State: { workflowContext: 'awaiting_deal_confirmation', pendingProduct: 'apples' }
User: "yes"
  ↓
Supervisor Early Check: detects confirmation context
  ↓
Returns: { next: 'cart_and_checkout', ... }
  ↓
✅ No planner call needed - instant routing
```

### Flow 2: Complex Request (Using Context-Aware Planner)

```
State: { workflowContext: 'none', pendingProduct: null }
User: "Check deals on bananas and add to cart"
  ↓
Supervisor: no early checks match
  ↓
Planner receives:
  - messages: ["Check deals on bananas and add to cart"]
  - workflowContext: "none"
  - pendingProduct: "none"
  ↓
Planner LLM sees context + message
  ↓
Returns: { action: "delegate", confidence: 1.0, reasoning: "multi-step shopping" }
  ↓
Supervisor: detects complex workflow
  ↓
✅ Routes to deals agent first
```

### Flow 3: Mid-Transaction Continuation (Using Context-Aware Planner)

```
State: { workflowContext: 'add_to_cart_with_deals', pendingProduct: 'milk' }
User: "actually make it 2"
  ↓
Supervisor: no early check (not a critical path)
  ↓
Planner receives:
  - messages: [...history..., "actually make it 2"]
  - workflowContext: "add_to_cart_with_deals"
  - pendingProduct: "milk (qty: 1)"
  ↓
Planner LLM: "Context shows user modifying cart operation"
  ↓
Returns: { action: "delegate", confidence: 0.95, reasoning: "cart modification" }
  ↓
Supervisor: routes to cart_and_checkout
  ↓
✅ Cart agent updates quantity
```

---

## Implementation Checklist

### ✅ Pattern 1: Context-Aware Planner

- [x] Add context variables to prompt template
- [x] Extract workflowContext, pendingProduct, dealData from state
- [x] Pass context to planner LLM invoke
- [x] Update cache key to include context
- [x] Add context awareness rules to prompt

### ✅ Pattern 2: Early Context Checks

- [x] Add awaiting_deal_confirmation check before planner
- [x] Add add_to_cart_with_deals check before planner
- [x] Handle affirmative/negative responses
- [x] Clear state on workflow completion

### Performance Considerations

**Cache Strategy:**

```typescript
// Old cache key (stateless)
key = `${userId}:${convId}:${messages.join('|')}`;

// New cache key (context-aware)
key = `${userId}:${convId}:${workflowContext}:${pendingProduct}:${messages.join('|')}`;
```

**Cache Invalidation:**

- When `workflowContext` changes → Invalidate cache
- When `pendingProduct` changes → Invalidate cache
- When deal is applied/declined → Invalidate cache

```typescript
// Example
if (dealData?.applied || dealData?.declined) {
  invalidatePlannerCacheByPrefix(`${conversationId}:${userId}`);
}
```

---

## Testing Strategy

### Test 1: Context-Aware Classification

```typescript
test('planner recognizes continuation with context', async () => {
  const state = {
    messages: [{content: 'yes'}],
    workflowContext: 'awaiting_deal_confirmation',
    pendingProduct: {product: 'apples', quantity: 5},
  };

  const result = await planner(state);
  expect(result.action).toBe('delegate');
  expect(result.confidence).toBeGreaterThan(0.95);
});
```

### Test 2: Early Check Bypass

```typescript
test('supervisor bypasses planner for critical context', async () => {
  const state = {
    messages: [{content: 'sure'}],
    workflowContext: 'awaiting_deal_confirmation',
    pendingProduct: {product: 'milk'},
  };

  const result = await supervisor(state);
  expect(result.next).toBe('cart_and_checkout');
  // No planner call made
});
```

### Test 3: Stateless Fallback

```typescript
test('planner works without context (fallback)', async () => {
  const state = {
    messages: [{content: 'Find bananas'}],
    // No context provided
  };

  const result = await planner(state);
  expect(result.action).toBe('delegate');
});
```

---

## Migration Path

### Phase 1: Add Context to Planner (✅ Done)

- Update prompt template
- Pass context variables
- Update cache keys

### Phase 2: Add Early Checks (✅ Done)

- Critical workflow contexts
- Deterministic routing
- Safety nets

### Phase 3: Monitor & Tune

- Log planner confidence scores
- Track cache hit rates
- Identify patterns for early checks

### Phase 4: Optimize

- Add more early checks for common patterns
- Reduce planner calls for known scenarios
- Fine-tune context thresholds

---

## Metrics to Monitor

```typescript
{
  planner: {
    totalCalls: 1250,
    cacheHits: 450,        // 36% cache hit rate
    avgConfidence: 0.87,
    delegateCount: 1100,
    directResponseCount: 150
  },
  supervisor: {
    earlyCheckHits: 320,   // 25% bypassed planner entirely
    contextOverrides: 45    // Supervisor overrode planner
  }
}
```

**Target Performance:**

- Cache hit rate: >40%
- Avg confidence: >0.85
- Early check rate: >20% (critical paths)

---

## Date

October 19, 2025

## Related Documents

- `DEAL_CONFIRMATION_CONTEXT_FIX.md` - Specific fix for deal confirmation
- `DEALS_AGENT_SIMPLIFICATION.md` - Agent architecture cleanup
- `SUPERVISOR_UPGRADE_SUMMARY.md` - Overall supervisor design
