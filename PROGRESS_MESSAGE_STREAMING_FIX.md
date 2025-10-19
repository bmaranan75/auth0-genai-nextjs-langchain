# Progress Message Streaming Fix

## Problem

After moving progress messages to the supervisor routing logic (to show them BEFORE agents start), only the FIRST progress message was appearing in the stream, not all progress messages.

## Root Cause

**Timestamp-based deduplication collision**: The chat API route uses timestamp-based deduplication to prevent duplicate progress messages:

```typescript
// In src/app/api/chat/route.ts
if (!sentProgressTimestamps.has(msg.timestamp)) {
  sendSSE({ type: 'progress', content: progressContent, ... });
  sentProgressTimestamps.add(msg.timestamp);
}
```

When multiple progress messages were created within the same supervisor execution using `Date.now()`, they received **identical or nearly identical timestamps** (since `Date.now()` is called in rapid succession). The deduplication logic then filtered out all but the first message with that timestamp.

### Example Timeline

```
Time 0ms:  completionMessage.timestamp = Date.now() = 1000
Time 1ms:  routingMessage.timestamp = Date.now() = 1000 (same!)
Time 2ms:  agentProgressMessage.timestamp = Date.now() = 1000 (same!)

Result: All 3 messages have timestamp 1000
→ Deduplication keeps only the first one
→ User sees only "🧠 Evaluating request..." and nothing else
```

## Solution

**Ensure unique timestamps for each progress message** by introducing a `timestampOffset` counter that increments for each progress message created within a single supervisor execution:

```typescript
let timestampOffset = 0; // Used to ensure unique timestamps

// First message
const completionMessage = createProgressMessage(
  '✅ Agent task completed...',
  'supervisor',
);
completionMessage.timestamp = Date.now() + timestampOffset++; // 1000 + 0 = 1000

// Second message
const routingMessage = createProgressMessage(
  '🧠 Evaluating request...',
  'supervisor',
);
routingMessage.timestamp = Date.now() + timestampOffset++; // 1000 + 1 = 1001

// Third message
const agentProgressMessage = getAgentProgressMessage('deals', 'check_deals');
agentProgressMessage.timestamp = Date.now() + timestampOffset++; // 1000 + 2 = 1002
```

This ensures each progress message has a **guaranteed unique timestamp**, even when created milliseconds apart.

## Changes Made

### File: `/src/lib/agents/supervisor.ts`

1. **Added `timestampOffset` counter** at the start of supervisor function:

   ```typescript
   let timestampOffset = 0; // Used to ensure unique timestamps for progress messages
   ```

2. **Updated all progress message creation** to use unique timestamps:
   - Completion messages (deals, cart, catalog, payment, notification)
   - Routing/evaluation messages
   - Agent-specific progress messages in all return paths

3. **Updated 7 locations** where progress messages are created:
   - Initial completion message (if agent just completed)
   - Initial routing/evaluation message
   - Planner recommendation routing
   - Continuation analysis routing (3 cases)
   - Workflow context overrides (2 cases)
   - Final general routing

## Testing

### Expected Behavior

When testing "add 8 apples to my cart":

1. First see: "🧠 Evaluating request..." (timestamp: 1000)
2. Then see: "🛒 Managing your cart..." (timestamp: 1001)
3. Then agent works and returns result

All progress messages should stream sequentially, not just the first one.

### Test Cases

**Simple query:**

```
User: "add 8 apples to my cart"
Expected stream:
1. 🧠 Evaluating request... [timestamp: 1000]
2. 🛒 Managing your cart... [timestamp: 1001]
3. [Agent response] "Added 8 apples to your cart"
```

**Complex workflow:**

```
User: "check for deals on apples and add 8 to my cart"
Expected stream:
1. 🧠 Evaluating request... [timestamp: 1000]
2. 🏷️ Checking for deals... [timestamp: 1001]
3. [Deals agent response]
4. 🔄 Evaluating next steps... [timestamp: 1002]
5. 🛒 Managing your cart... [timestamp: 1003]
6. [Cart agent response]
```

**Agent completion:**

```
After deals agent completes:
Expected stream:
1. 🏷️ Deal search completed... [timestamp: 1000]
2. 🔄 Evaluating next steps... [timestamp: 1001]
3. 🛒 Managing your cart... [timestamp: 1002]
4. [Cart agent response]
```

## Technical Details

### Why This Works

- **Timestamp uniqueness**: Each message gets a unique timestamp by incrementing offset
- **Stream ordering**: Messages maintain temporal ordering (earlier offset = earlier timestamp)
- **Deduplication compatibility**: Works perfectly with existing timestamp-based deduplication
- **No race conditions**: All timestamps generated synchronously in single function execution

### Why We Don't Use Delays

We could have added `await new Promise(r => setTimeout(r, 10))` between message creation, but:

- ❌ Adds unnecessary latency (10ms per message)
- ❌ Makes supervisor function async-heavy
- ❌ Complicates testing
- ✅ Offset approach is instant and deterministic

## Integration with Previous Fixes

This fix builds on:

1. **Progress Message Timing Fix**: Moved progress messages to supervisor (before agents start)
2. **Complex Workflow Fix**: Auto-apply intent detection for "just take them" scenarios

Together, these fixes provide:

- ✅ Progress messages appear BEFORE agents start work
- ✅ Multiple progress messages stream sequentially
- ✅ Complex workflows auto-proceed when appropriate
- ✅ Natural language intent ("just take them") works correctly

## Verification

Run TypeScript compilation:

```bash
npx tsc --noEmit
```

Result: ✅ No errors

## Next Steps

Test the complete flow:

1. Test simple cart addition: "add 8 apples to my cart"
2. Test complex workflow: "check deals and add 9 bananas if you find any"
3. Test auto-apply: "add 10 carrots and just take any deals"
4. Verify all progress messages appear in correct sequence
5. Verify no duplicate messages appear

## Summary

**Problem**: Only first progress message streaming due to timestamp collision
**Root Cause**: Multiple messages created with identical `Date.now()` timestamps
**Solution**: Add `timestampOffset` counter to ensure unique timestamps
**Result**: All progress messages stream sequentially with guaranteed unique timestamps
**Status**: ✅ Complete, ready for testing
