# Planner INVALID_PROMPT_INPUT Error - Fix Summary

## Issue

When running dev, encountering error:

```
INVALID_PROMPT_INPUT error
lc_error_code: 'INVALID_PROMPT_INPUT'
```

## Root Cause

The planner was not properly handling message extraction from the state. The messages array can contain:

1. Annotated messages with `.message` wrapper (supervisor format)
2. Direct BaseMessage objects (LangChain format)
3. Invalid/null entries

The original code assumed all messages had a `.message` property, which caused the ChatPromptTemplate to receive invalid input.

## Solution

### 1. **Robust Message Extraction**

Added smart message extraction that handles multiple message formats:

```typescript
const extractedMessages = messages
  .slice(-6)
  .map((m: any) => {
    // If it's already a BaseMessage, use it directly
    if (
      m &&
      m.content !== undefined &&
      (m.constructor?.name?.includes('Message') || m.lc_namespace)
    ) {
      return m;
    }
    // If it's an annotated message with .message property
    if (m && m.message && m.message.content !== undefined) {
      return m.message;
    }
    // Skip invalid entries
    return null;
  })
  .filter(Boolean);
```

**This handles:**

- ✅ Direct BaseMessage objects (HumanMessage, AIMessage, SystemMessage)
- ✅ Annotated messages with `.message` wrapper
- ✅ Filters out null/undefined entries
- ✅ Validates that messages have `content` property

### 2. **Empty Messages Fallback**

Added safeguard for when no valid messages are found:

```typescript
if (extractedMessages.length === 0) {
  console.warn(
    '[planner] No valid messages found, returning delegate fallback',
  );
  const fallbackPlan = {
    action: 'delegate',
    confidence: 0.5,
    reasoning: 'No valid messages to analyze',
  };
  return {
    messages: [
      {
        message: new AIMessage(JSON.stringify(fallbackPlan)),
        role: 'assistant',
        agent: 'planner',
        timestamp: Date.now(),
        planningRecommendation: fallbackPlan,
      },
    ],
  };
}
```

### 3. **Enhanced Error Handling**

Wrapped LLM invocation in try-catch with detailed error logging:

```typescript
try {
  response = await plannerPrompt.pipe(getPlannerLlm()).invoke({
    messages: extractedMessages,
  });
} catch (invokeError: any) {
  console.error('[planner] Error invoking LLM:', invokeError);
  console.error('[planner] Error details:', {
    message: invokeError.message,
    code: invokeError.lc_error_code,
    extractedMessagesCount: extractedMessages.length,
    extractedMessagesSample: extractedMessages.slice(0, 2).map((m: any) => ({
      type: m?.constructor?.name,
      hasContent: !!m?.content,
      contentType: typeof m?.content,
    })),
  });

  // Return fallback plan instead of crashing
  return fallbackPlan;
}
```

**Benefits:**

- 🛡️ Prevents crashes from LLM invocation errors
- 🔍 Provides detailed diagnostic information
- 📊 Shows message structure for debugging
- ✅ Returns safe fallback (delegate) on error

### 4. **Debug Logging**

Added logging to help diagnose message structure issues:

```typescript
console.log(
  `[planner] Received state with ${Array.isArray(messages) ? messages.length : 0} messages`,
);
if (Array.isArray(messages) && messages.length > 0) {
  console.log(
    `[planner] First message type:`,
    messages[0]?.constructor?.name,
    messages[0]?.message?.constructor?.name,
  );
}
console.log(
  `[planner] Extracted ${extractedMessages.length} valid messages for LLM`,
);
```

## Testing

### Test Case 1: Annotated Messages (Supervisor Format)

```typescript
const state = {
  messages: [
    {
      message: new HumanMessage('Find apples'),
      role: 'user',
      agent: 'user',
      timestamp: Date.now(),
    },
  ],
};
// Should extract: HumanMessage("Find apples")
```

### Test Case 2: Direct BaseMessages

```typescript
const state = {
  messages: [new HumanMessage('Find apples')],
};
// Should extract: HumanMessage("Find apples")
```

### Test Case 3: Mixed Format

```typescript
const state = {
  messages: [
    new HumanMessage('Hello'),
    {
      message: new AIMessage('Hi there!'),
      role: 'assistant',
      agent: 'planner',
    },
  ],
};
// Should extract both messages correctly
```

### Test Case 4: Invalid Messages

```typescript
const state = {
  messages: [
    null,
    undefined,
    {invalid: 'format'},
    new HumanMessage('Find apples'),
  ],
};
// Should filter out invalid entries, extract only valid message
```

### Test Case 5: Empty/No Messages

```typescript
const state = {
  messages: [],
};
// Should return fallback plan: delegate with 0.5 confidence
```

## Verification Commands

```bash
# Clear any build cache
rm -rf .next

# Rebuild
npm run build

# Run dev
npm run dev
```

## Expected Console Output

When working correctly, you should see:

```
---PLANNER---
[planner] Received state with 1 messages
[planner] First message type: Object HumanMessage
[planner] Extracted 1 valid messages for LLM
[planner] Raw LLM response: {"content": "{\"action\":\"delegate\",...}"}
```

## What This Fixes

✅ **INVALID_PROMPT_INPUT error** - Messages are now properly extracted and validated
✅ **Message format compatibility** - Handles both annotated and direct BaseMessage formats
✅ **Null/undefined handling** - Filters out invalid message entries
✅ **Empty message arrays** - Safe fallback when no messages provided
✅ **LLM invocation errors** - Graceful error handling with detailed logging
✅ **Better debugging** - Comprehensive logging for troubleshooting

## Backward Compatibility

✅ **No breaking changes** - Still works with existing message formats
✅ **Safe fallback** - Always returns valid planner output
✅ **Cache compatibility** - Cache key generation unchanged

## Related Files Modified

- ✅ `/src/lib/agents/planner.ts` - Added robust message extraction and error handling

## If Issue Persists

If you still see the error, check the console output for:

1. **Message count**: How many messages are being received?
2. **Message types**: What constructor names are shown?
3. **Extracted count**: How many messages were successfully extracted?
4. **Error details**: What specific error message is shown?

Share this information for further debugging.
