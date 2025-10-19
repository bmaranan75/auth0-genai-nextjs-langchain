# Deals Node Product Extraction Fix

## Problem

The deals node was crashing with a branch condition error when it didn't have a pending product:

```
[dealsNode] Workflow context: check_deals
[dealsNode] Pending product: undefined
[dealsNode] No pending product could be extracted (fallback)
[chat-api] Stream error: [Error: Branch condition returned unknown or null destination]
```

The deals agent requires product information to search for deals, but the fallback extraction logic was only checking the last message, which might not contain product information if the user's query was split across multiple messages or if the supervisor modified the message.

## Root Cause

1. **Supervisor routes to deals node without pending product**: In some edge cases, the supervisor might route to the deals agent without extracting a pending product first
2. **Single message extraction insufficient**: The old fallback only checked the current/last message, which might be a routing instruction or follow-up question
3. **No graceful failure**: If extraction failed, the code continued to call the deals agent without a product, causing routing errors

### Example Failure Scenario

```
User: "check for deals"  (no product specified)
Supervisor: Routes to deals agent with workflowContext='check_deals' but pendingProduct=undefined
Deals Node: Tries to extract from "check for deals" → fails
Deals Node: Calls agent anyway without product → crash
```

## Solution

### 1. Enhanced Multi-Message Extraction

Look back at the **last 2 user messages** to find product information:

```typescript
if (!effectivePending) {
  console.log(
    '[dealsNode] No pending product in state, attempting extraction from recent messages',
  );

  // Get last 2 user messages to search for product information
  const userMessages = messages.filter(m => m.role === 'user');
  const recentUserMessages = userMessages.slice(-2); // Last 2 user messages

  // Try extracting from each recent message, most recent first
  for (
    let i = recentUserMessages.length - 1;
    i >= 0 && !effectivePending;
    i--
  ) {
    const msg = recentUserMessages[i];
    const content =
      typeof msg.message.content === 'string'
        ? msg.message.content
        : String(msg.message.content);

    const extracted = await extractProductInfo(content);
    if (extracted && extracted.product) {
      effectivePending = extracted;
      console.log(
        '[dealsNode] Successfully extracted pending product from recent message:',
        effectivePending,
      );
      break;
    }
  }
}
```

### 2. Graceful Failure with Helpful Message

If we still can't extract a product after checking recent messages, return a helpful prompt instead of crashing:

```typescript
// CRITICAL: If we still don't have a product after extraction attempts, return helpful error
if (!effectivePending) {
  console.log(
    '[dealsNode] ERROR: No product information available for deals search',
  );
  const errorMessage = new AIMessage(
    "I need to know which product you're interested in to check for deals. Could you please specify the product name? For example, 'Check deals on apples' or 'Add 8 apples to my cart'.",
  );
  return {
    messages: [annotateMessage(errorMessage, 'assistant', 'deals')],
    userId,
    conversationId,
    workflowContext: null, // Clear context since we can't proceed
    dealData,
    pendingProduct: null,
    cartData,
    next: END,
  };
}
```

## Benefits

### 1. Handles Split Conversations

```
User: "I want to add something to my cart"
Agent: "What would you like to add?"
User: "check for deals first"
→ Deals node looks back and finds "add" context, but no product
→ Returns helpful prompt asking for product name
```

### 2. Handles Complex Workflows

```
User: "add 8 apples to my cart and check for deals"
Supervisor: Routes to deals first
→ Deals node extracts "apples" from user message
→ Proceeds normally
```

### 3. Handles Ambiguous Queries

```
User: "are there any deals?"
Supervisor: Routes to deals (no product extracted by supervisor)
→ Deals node checks last 2 user messages
→ No product found
→ Returns "Which product are you interested in?"
```

### 4. Prevents Crashes

- **Before**: Crash with branch condition error
- **After**: Graceful error message prompting for missing information

## Changes Made

### File: `/src/lib/agents/supervisor.ts`

**Location**: `dealsNode` function (lines ~1260-1310)

**Changes**:

1. Replaced single-message extraction with multi-message loop
2. Added logging for extraction attempts
3. Added safety check after extraction with helpful error message
4. Clear workflow context on failure to allow fresh start

## Testing

### Test Case 1: Ambiguous Query

```
Input: "check for deals"
Expected: "I need to know which product you're interested in..."
```

### Test Case 2: Split Conversation

```
User: "I want to buy something"
Agent: "What would you like?"
User: "check for deals first"
Expected: "I need to know which product you're interested in..."
```

### Test Case 3: Product in Previous Message

```
User: "add 8 apples to my cart"
Agent: "Would you like me to check for deals first?"
User: "yes"
Supervisor: Routes to deals
Expected: Extracts "apples" from previous message, proceeds normally
```

### Test Case 4: Complex Workflow

```
User: "check deals on bananas and add 5 to my cart"
Expected: Extracts "bananas", proceeds normally
```

### Test Case 5: Current Message Has Product

```
User: "check for deals on carrots"
Expected: Extracts "carrots" from current message, proceeds normally
```

## Verification

Run TypeScript compilation:

```bash
npx tsc --noEmit
```

Result: ✅ No errors

## Integration with Previous Fixes

This fix works alongside:

1. **Progress Message Streaming Fix**: Unique timestamps for progress messages
2. **Complex Workflow Fix**: Auto-apply intent detection
3. **Progress Message Timing Fix**: Messages appear before agents start

Together, these provide:

- ✅ Robust product extraction from conversation history
- ✅ Graceful failure with helpful prompts
- ✅ No crashes from missing product information
- ✅ Better user experience with clear guidance

## Summary

**Problem**: Deals node crashed when no product information was available
**Root Cause**: Only checked current message, no fallback for missing product
**Solution**: Check last 2 user messages, return helpful prompt if still no product
**Result**: No more crashes, better UX with clear error messages
**Status**: ✅ Complete, ready for testing
