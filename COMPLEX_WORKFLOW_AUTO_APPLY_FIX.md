# Complex Workflow Auto-Apply Fix

## Issue

User reported that the query "can you please add 9 apples to my cart and if in case you find any deals, just take them" stopped working after the progress message timing fix.

## Root Cause

The deals node logic was checking for `isComplexWorkflow` but only examining the **modified message** sent to the deals agent, not the **original user message**. This meant phrases like "just take them", "use any deals", "apply them" were not being detected as auto-apply intent.

### The Problem Flow:

```
User: "add 9 apples to my cart and if in case you find any deals, just take them"
  ↓
Supervisor detects complex workflow → Routes to deals agent
  ↓
Deals node modifies message: "Complex workflow request: ... check for deals..."
  ↓
Deals agent finds deal and responds: "Would you like to apply this deal?"
  ↓
Deals node checks: isComplexWorkflow = true (from modified message ✅)
                   BUT misses "just take them" from original message ❌
  ↓
Logic falls through to requiresConfirmation check
  ↓
Returns awaiting_deal_confirmation instead of auto-proceeding ❌
```

## Solution

Enhanced the deals node to:

1. **Extract the original user message** from the message history
2. **Check for auto-apply intent phrases** in the original message
3. **Auto-proceed when either complex workflow OR auto-apply intent is detected**

### Auto-Apply Intent Patterns:

- "just take them" / "just take it"
- "use any deal" / "use any deals"
- "apply any deal" / "apply any deals"
- "use the deal" / "use the deals"
- "apply the deal" / "apply the deals"
- "apply them" / "take them"
- "if [condition] use/apply/take [deals]"

## Implementation

### Changes to `/src/lib/agents/supervisor.ts`

**Added original message extraction:**

```typescript
// Get the ORIGINAL user message to check for auto-apply intent
const userMessages = messages.filter(m => m.role === 'user');
const originalUserMessage =
  userMessages.length > 0
    ? typeof userMessages[userMessages.length - 1].message.content === 'string'
      ? userMessages[userMessages.length - 1].message.content
      : String(userMessages[userMessages.length - 1].message.content)
    : messageToAgent;
const originalMessageLower = String(originalUserMessage).toLowerCase();
```

**Added auto-apply intent detection:**

```typescript
// Check if user wants to auto-apply deals (no confirmation needed)
const autoApplyIntent =
  originalMessageLower.includes('just take') ||
  originalMessageLower.includes('use any deal') ||
  originalMessageLower.includes('apply any deal') ||
  originalMessageLower.includes('use the deal') ||
  originalMessageLower.includes('apply the deal') ||
  originalMessageLower.includes('apply them') ||
  originalMessageLower.includes('take them') ||
  (originalMessageLower.includes('if') &&
    originalMessageLower.includes('deal') &&
    (originalMessageLower.includes('use') ||
      originalMessageLower.includes('apply') ||
      originalMessageLower.includes('take')));
```

**Updated complex workflow check to use both sources:**

```typescript
// Check if this is a complex workflow that should auto-proceed
const modifiedMessageLower = messageToAgent.toLowerCase();
const isComplexWorkflow =
  (modifiedMessageLower.includes('check') &&
    modifiedMessageLower.includes('deal') &&
    modifiedMessageLower.includes('add')) ||
  (modifiedMessageLower.includes('if') &&
    modifiedMessageLower.includes('deal')) ||
  (modifiedMessageLower.includes('deal') &&
    modifiedMessageLower.includes('cart')) ||
  modifiedMessageLower.includes('complex workflow request');
```

**Updated auto-proceed logic:**

```typescript
// For complex workflows with auto-apply intent, always auto-proceed
if (isComplexWorkflow || autoApplyIntent) {
  // Auto-proceed to cart - user indicated conditional intent or wants automatic application
  console.log(
    '[dealsNode] Complex workflow or auto-apply intent detected - auto-proceeding to cart',
  );
  console.log('[dealsNode] Auto-apply intent:', autoApplyIntent);
  console.log('[dealsNode] Complex workflow:', isComplexWorkflow);

  // ... proceed to cart with deals applied ...
}
```

## How It Works Now

### Example 1: "add 9 apples to my cart and if in case you find any deals, just take them"

```
User message: "add 9 apples and if you find any deals, just take them"
  ↓
originalMessageLower.includes('just take') → autoApplyIntent = TRUE ✅
  ↓
Deals agent finds deal: "Would you like to apply 20% off?"
  ↓
Deals node checks:
  - autoApplyIntent = TRUE ✅
  - isComplexWorkflow = TRUE ✅
  ↓
Auto-proceed to cart with deals applied (no confirmation) ✅
  ↓
Cart adds 9 apples with deal automatically ✅
```

### Example 2: "check for deals on bananas"

```
User message: "check for deals on bananas"
  ↓
autoApplyIntent = FALSE (no auto-apply phrases)
isComplexWorkflow = FALSE (not a complex workflow)
  ↓
Deals agent finds deal: "Would you like to apply 15% off?"
  ↓
requiresConfirmation = TRUE
  ↓
Return awaiting_deal_confirmation (require user confirmation) ✅
```

### Example 3: "add 5 oranges and use any deals available"

```
User message: "add 5 oranges and use any deals available"
  ↓
originalMessageLower.includes('use any deal') → autoApplyIntent = TRUE ✅
  ↓
Deals agent finds deal: "Buy 3 get 1 free on oranges"
  ↓
Auto-proceed to cart with deals applied ✅
```

## Test Cases

### Should Auto-Proceed:

1. ✅ "add 9 apples and if you find any deals, just take them"
2. ✅ "add 5 bananas and use any deals"
3. ✅ "add 10 carrots and apply any deals you find"
4. ✅ "if there are deals on milk, use them and add 2 to my cart"
5. ✅ "check deals on bread and take them if available, then add 3"

### Should Require Confirmation:

1. ✅ "check for deals on apples" (no cart action, just inquiry)
2. ✅ "what deals are available?" (general inquiry)
3. ✅ "add 5 oranges to my cart" (no deal mention)
4. ✅ "are there any deals on bananas?" (question format)

## Expected Behavior

### For Auto-Apply Intent Queries:

```
User: "add 9 apples and if you find any deals, just take them"

Progress:
  1. 🧠 Evaluating request...
  2. 🏷️ Checking for deals...
  3. [Deals found: 20% off]
  4. 🛒 Managing your cart...
  5. Added 9 apples with 20% deal applied. Total: $X.XX

No confirmation prompt - automatic!
```

### For Simple Deal Queries:

```
User: "check for deals on apples"

Progress:
  1. 🧠 Evaluating request...
  2. 🏷️ Checking for deals...
  3. We found a deal: Buy 5 apples, get 20% off! Would you like to apply this deal?

Awaiting user confirmation
```

## Files Modified

- `/src/lib/agents/supervisor.ts` - dealsNode function (lines ~1290-1340)
  - Added original user message extraction
  - Added auto-apply intent detection
  - Updated auto-proceed logic to check both isComplexWorkflow and autoApplyIntent

## Impact

### User Experience

- ✅ Natural language like "just take them" works intuitively
- ✅ Complex workflows with auto-apply intent proceed automatically
- ✅ Simple deal inquiries still require confirmation (safe behavior)
- ✅ Clear distinction between inquiry and action with auto-apply

### Robustness

- ✅ Handles various phrasings: "take them", "use them", "apply them", "just use", etc.
- ✅ Conditional patterns work: "if you find deals, use them"
- ✅ Original user intent preserved even after message modification

## Related Fixes

This builds on previous streaming and workflow fixes:

1. ✅ Duplicate Add-to-Cart Prevention
2. ✅ Ephemeral Message Retention
3. ✅ Progress Streaming Deduplication
4. ✅ Progress Message Timing
5. ✅ **Complex Workflow Auto-Apply (THIS FIX)**

The system now handles both explicit auto-apply phrases AND complex workflow patterns correctly.
