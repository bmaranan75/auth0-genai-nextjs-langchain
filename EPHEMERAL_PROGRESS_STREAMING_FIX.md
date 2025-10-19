# Ephemeral Progress Messages Streaming Fix

## Issue Description

Progress feedback messages from agent nodes (especially the deals agent) were not appearing in the UI during streaming. Users would see supervisor routing messages but not the intermediate agent-specific progress updates like "🏷️ Checking for deals...".

### User Report

- Deals agent progress messages not showing: "🏷️ Checking for deals..."
- Other agent progress may also be affected
- Only final responses appearing, no intermediate feedback

## Root Cause Analysis

### The Problem

The `SupervisorState` messages reducer was **filtering out ephemeral progress messages** before they could be streamed to the client:

```typescript
// OLD CODE (PROBLEMATIC):
const SupervisorState = Annotation.Root({
  messages: Annotation<Array<AnnotatedMessage>>({
    reducer: (x, y) => {
      const combined = x.concat(y);
      // Filter out ephemeral status messages to prevent memory bloat
      const permanent = combined.filter(
        msg =>
          !msg.progress?.isProgressUpdate || msg.progress?.ephemeral !== true, // ❌ Removes ephemeral messages!
      );
      return permanent.slice(-10);
    },
  }),
  // ...
});
```

### Why This Caused Issues

1. **Progress messages are created as ephemeral**:

   ```typescript
   const dealsProgressMessage = createProgressMessage(
     '🏷️ Checking for deals...',
     'deals',
   );
   // Creates message with ephemeral: true
   ```

2. **LangGraph streaming works by emitting state snapshots**:
   - After each node executes, LangGraph emits the current state
   - The state includes the `messages` array
   - Chat API route processes these state snapshots

3. **Reducer removes ephemeral messages immediately**:
   - Node adds ephemeral message to state
   - Reducer filters it out: `ephemeral !== true`
   - Stream chunk has no ephemeral messages
   - API route never sees them → no progress updates sent to client

### The Flow (Before Fix)

```
dealsNode
  └─> Creates: createProgressMessage('🏷️ Checking for deals...', 'deals')
       └─> Returns: { messages: [dealsProgressMessage, ...] }
            └─> SupervisorState reducer processes messages
                 └─> Filters out ephemeral (ephemeral === true) ❌
                      └─> Stream chunk: { deals: { messages: [...no progress...] } }
                           └─> API route: No progress messages to send
                                └─> Client: No feedback shown ❌
```

### Why the Reducer Was Filtering

The original intent was good - prevent memory bloat by not storing temporary status messages permanently. However, the implementation was too aggressive, removing messages before they could be streamed.

## Solution

### Updated Reducer Logic

Modified the `SupervisorState` messages reducer to:

1. **Keep ephemeral messages temporarily** for streaming visibility
2. **Limit their count** (last 5) to prevent memory issues
3. **Maintain permanent message history** (last 10) for LLM context
4. **Place ephemeral messages at the end** so they appear in stream chunks

```typescript
// NEW CODE (FIXED):
const SupervisorState = Annotation.Root({
  messages: Annotation<Array<AnnotatedMessage>>({
    reducer: (x, y) => {
      const combined = x.concat(y);
      // CRITICAL FIX: Keep ephemeral messages temporarily for streaming
      // They will be visible in the stream chunks sent to the client
      // But we still limit total history to prevent memory bloat

      // First, separate ephemeral (recent progress) from permanent messages
      const ephemeral = combined.filter(
        msg =>
          msg.progress?.isProgressUpdate && msg.progress?.ephemeral === true,
      );
      const permanent = combined.filter(
        msg =>
          !msg.progress?.isProgressUpdate || msg.progress?.ephemeral !== true,
      );

      // Keep only recent ephemeral messages (last 5 for current operation feedback)
      const recentEphemeral = ephemeral.slice(-5);

      // Keep last 10 permanent messages for LLM context
      const recentPermanent = permanent.slice(-10);

      // Combine: permanent messages first, then ephemeral (so they're at the end for streaming)
      return [...recentPermanent, ...recentEphemeral];
    },
  }),
  // ...
});
```

### The Flow (After Fix)

```
dealsNode
  └─> Creates: createProgressMessage('🏷️ Checking for deals...', 'deals')
       └─> Returns: { messages: [dealsProgressMessage, ...] }
            └─> SupervisorState reducer processes messages
                 └─> Keeps recent ephemeral (last 5) ✅
                      └─> Stream chunk: { deals: { messages: [...progress...] } }
                           └─> API route: Detects progress messages
                                └─> Sends SSE: { type: 'progress', content: '🏷️ Checking for deals...' }
                                     └─> Client: Shows progress feedback ✅
```

## Benefits of This Approach

1. **Streaming Works**: Ephemeral messages are present in stream chunks
2. **Memory Controlled**: Only keeps last 5 ephemeral + last 10 permanent messages
3. **LLM Context Clean**: Permanent messages (conversation history) are separate
4. **Backward Compatible**: No changes needed to agent nodes or API route
5. **Self-Cleaning**: Old ephemeral messages are naturally dropped as new ones arrive

## Message Lifecycle

```
1. CREATION (Agent Node)
   └─> createProgressMessage('🏷️ Checking for deals...', 'deals')
       - ephemeral: true
       - isProgressUpdate: true
       - autoRemoveMs: 5000

2. STATE UPDATE (Reducer)
   └─> Keep in recentEphemeral (last 5)
       - Available for streaming ✅
       - Not permanent history ✅

3. STREAMING (LangGraph)
   └─> Emit state with ephemeral messages
       - Stream chunk includes progress ✅

4. API PROCESSING (Chat Route)
   └─> Detect ephemeral messages
       - Check: msg.progress?.ephemeral === true
       - Send as SSE progress event ✅

5. CLIENT DISPLAY (UI)
   └─> Show progress update
       - Display feedback to user ✅
       - Auto-remove after 5s (optional) ✅

6. CLEANUP (Next Messages)
   └─> Old ephemeral messages dropped
       - Only last 5 ephemeral kept
       - Memory stays controlled ✅
```

## Testing Verification

### Expected Behavior

When testing "add 8 apples to my cart and use any deals":

**Progress Updates Should Appear**:

1. 🧠 "Evaluating request..." (supervisor)
2. 🔍 "Step 1/3: Searching for available deals..." (supervisor)
3. 🏷️ "Checking for deals..." (deals agent) ← **THIS WAS MISSING BEFORE**
4. 🛒 "Step 2/3: Adding items to your cart..." (supervisor)
5. 🛒 "Managing your cart..." (cart agent)
6. Final response with cart contents

### Verification in Logs

**Server logs should show**:

```
[chat-api] Node 'deals' emitted 1 messages
[chat-api] Sent progress update: 🏷️ Checking for deals...
```

**Browser DevTools Network tab should show**:

```
data: {"type":"progress","content":"🏷️ Checking for deals...","agent":"deals","timestamp":...}
```

### Test All Agent Progress Messages

- ✅ **Catalog**: "🛍️ Searching our catalog..."
- ✅ **Deals**: "🏷️ Checking for deals..."
- ✅ **Cart**: "🛒 Managing your cart..."
- ✅ **Payment**: "💳 Managing payments..."
- ✅ **Notification**: "📧 Sending notifications..."
- ✅ **Supervisor**: "🧠 Evaluating request...", "🔄 Evaluating next steps..."

## Impact Assessment

### Files Modified

- `/src/lib/agents/supervisor.ts` - SupervisorState messages reducer (lines ~260-280)

### Risk Level: **LOW**

- Surgical change to reducer logic only
- Maintains memory limits (5 ephemeral + 10 permanent)
- No changes to agent node implementations
- No changes to API route streaming logic
- Backward compatible with existing code

### Performance Impact

- **Minimal**: Keeps 5 extra ephemeral messages temporarily
- **Memory**: ~1-2KB extra per conversation (5 short messages)
- **Benefit**: Much better UX with real-time progress feedback

## Related Code

### Progress Message Creation (All Agents)

All agent nodes create progress messages consistently:

```typescript
const catalogProgressMessage = createProgressMessage(
  '🛍️ Searching our catalog...',
  'catalog',
);
const dealsProgressMessage = createProgressMessage(
  '🏷️ Checking for deals...',
  'deals',
);
const cartProgressMessage = createProgressMessage(
  '🛒 Managing your cart...',
  'cart_and_checkout',
);
const paymentProgressMessage = createProgressMessage(
  '💳 Managing payments...',
  'payment',
);
```

### API Route Streaming Detection

The chat API correctly detects and streams progress messages:

```typescript
for (const msg of messages) {
  if (msg && msg.progress?.isProgressUpdate && msg.progress?.ephemeral) {
    sendSSE({
      type: 'progress',
      content: progressContent,
      agent: msg.agent || nodeName,
      timestamp: Date.now(),
    });
  }
}
```

### Client-Side Handling

UI should handle progress events:

```typescript
// SSE event: { type: 'progress', content: '🏷️ Checking for deals...', agent: 'deals' }
// Display as temporary status indicator
// Auto-remove after autoRemoveMs (5000ms)
```

## Conclusion

The fix ensures ephemeral progress messages are temporarily retained in the state long enough to be streamed to the client, while still maintaining memory efficiency by limiting their count. This provides users with real-time feedback about agent operations without bloating the conversation history.

**Status**: ✅ Fixed and ready for testing
**Priority**: Medium (UX improvement, not breaking functionality)
**Complexity**: Low (targeted reducer logic change)
**Testing Required**: Manual verification of progress messages appearing in UI
