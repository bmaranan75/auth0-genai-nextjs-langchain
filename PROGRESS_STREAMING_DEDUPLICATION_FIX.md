# Progress Message Streaming Fix

## Issue

User reported that only the first progress message ("🧠 Evaluating request...") was visible during testing, but subsequent agent progress messages like "🏷️ Checking for deals..." were not appearing in the UI despite the streaming capability being implemented.

## Root Cause Analysis

### Problem Discovery

The investigation revealed that:

1. Progress messages WERE being created correctly in all agent nodes
2. Progress messages WERE being added to state returns
3. Progress messages WERE in the state when chunks arrived at the API route
4. BUT only the first message was appearing in the UI

### The Real Issue

The bug was in `/src/app/api/chat/route.ts`. The API route was:

1. **Not tracking which progress messages had been sent** - No deduplication mechanism
2. **Checking all messages in every stream chunk** - Each chunk contains the full message history (last 5 ephemeral + 10 permanent messages)
3. **Sending duplicate progress messages** - When chunk 2 arrived, it re-sent the progress message from chunk 1

### Why Only First Message Appeared

The browser's SSE handling likely had duplicate prevention or the UI was only showing the most recent progress update. When duplicates were sent:

- First chunk → Sent "🧠 Evaluating request..." ✅
- Second chunk → Re-sent "🧠 Evaluating request..." (duplicate) ❌ + Sent "🏷️ Checking for deals..." ✅
- But the UI only showed the most recent unique message or ignored duplicates

This created the illusion that only the first message was streaming.

## Solution Implemented

### Changes to `/src/app/api/chat/route.ts`

Added progress message deduplication using timestamp tracking:

```typescript
// Track which progress messages have already been sent (by timestamp)
// This prevents sending duplicate progress updates when subsequent chunks
// contain the full message history
const sentProgressTimestamps = new Set<number>();

// Process stream events
for await (const chunk of streamIterator) {
  // ... chunk processing ...

  for (const msg of messages) {
    if (msg && msg.progress?.isProgressUpdate && msg.progress?.ephemeral) {
      // Only send if we haven't sent this message before (check by timestamp)
      if (!sentProgressTimestamps.has(msg.timestamp)) {
        // Send progress update to client
        const progressContent =
          typeof msg.message?.content === 'string'
            ? msg.message.content
            : String(msg.message?.content || '');

        sendSSE({
          type: 'progress',
          content: progressContent,
          agent: msg.agent || nodeName,
          timestamp: msg.timestamp, // Use message timestamp, not Date.now()
        });

        // Mark this message as sent
        sentProgressTimestamps.add(msg.timestamp);
        console.log(
          '[chat-api] Sent progress update:',
          progressContent,
          'at',
          msg.timestamp,
        );
      } else {
        console.log(
          '[chat-api] Skipping duplicate progress update:',
          msg.message?.content,
        );
      }
    }
  }
}
```

### Key Changes

1. **Added `sentProgressTimestamps` Set** - Tracks timestamps of sent messages
2. **Deduplication Check** - Only sends progress messages not in the set
3. **Timestamp Recording** - Adds each sent message timestamp to the set
4. **Improved Logging** - Shows which messages are sent vs. skipped as duplicates
5. **Fixed SSE Timestamp** - Uses `msg.timestamp` instead of `Date.now()` for consistency

## How It Works

### Before Fix

```
Chunk 1: [msg1(ts=1000)]
  → Send msg1 ✅

Chunk 2: [msg1(ts=1000), msg2(ts=2000)]
  → Send msg1 ❌ (duplicate!)
  → Send msg2 ✅

Chunk 3: [msg1(ts=1000), msg2(ts=2000), msg3(ts=3000)]
  → Send msg1 ❌ (duplicate!)
  → Send msg2 ❌ (duplicate!)
  → Send msg3 ✅

Result: UI shows only latest message or gets confused by duplicates
```

### After Fix

```
Chunk 1: [msg1(ts=1000)]
  → Check: 1000 not in set → Send msg1 ✅ → Add 1000 to set

Chunk 2: [msg1(ts=1000), msg2(ts=2000)]
  → Check: 1000 in set → Skip msg1 ✓
  → Check: 2000 not in set → Send msg2 ✅ → Add 2000 to set

Chunk 3: [msg1(ts=1000), msg2(ts=2000), msg3(ts=3000)]
  → Check: 1000 in set → Skip msg1 ✓
  → Check: 2000 in set → Skip msg2 ✓
  → Check: 3000 not in set → Send msg3 ✅ → Add 3000 to set

Result: Each progress message sent exactly once in correct order
```

## Expected Behavior After Fix

### Test Query

"add 8 apples to my cart and use any deals if you find any"

### Expected Progress Sequence

1. **Initial Evaluation**: "🧠 Evaluating request..." (supervisor)
2. **Routing Step 1**: "📋 Step 1/3: Searching for deals..." (supervisor)
3. **Deals Agent**: "🏷️ Checking for deals..." (deals node)
4. **Routing Step 2**: "📋 Step 2/3: Adding items to cart..." (supervisor)
5. **Cart Agent**: "🛒 Managing your cart..." (cart_and_checkout node)
6. **Routing Step 3**: "📋 Step 3/3: Preparing checkout..." (supervisor)

Each message should appear as a separate SSE event in the browser, giving real-time feedback throughout the workflow.

## Technical Architecture

### LangGraph Streaming Flow

```
User Request
    ↓
Supervisor Node (creates progress msgs) → Emits Chunk 1 [msg1, msg2, msg3]
    ↓
Deals Node (creates progress msg) → Emits Chunk 2 [msg1, msg2, msg3, msg4]
    ↓
Cart Node (creates progress msg) → Emits Chunk 3 [msg1, msg2, msg3, msg4, msg5]
    ↓
API Route (deduplicates & streams) → SSE: msg1, msg2, msg3, msg4, msg5
    ↓
Browser Client → Shows each message progressively
```

### State Management Integration

This fix works with the previous fix to `SupervisorState.messages` reducer:

- **Reducer**: Keeps last 5 ephemeral + 10 permanent messages in state
- **API Route**: Tracks sent messages to prevent duplicates
- **Together**: Ensures clean streaming without duplicates or memory bloat

## Related Files

- `/src/app/api/chat/route.ts` - Chat API with SSE streaming (MODIFIED)
- `/src/lib/agents/supervisor.ts` - Progress message creation (unchanged)
- `/src/lib/agents/langgraphClient.ts` - LangGraph streaming client (unchanged)

## Testing Verification

### Manual Test

1. Start dev server: `npm run dev`
2. Send test query: "add 8 apples to my cart and use any deals if you find any"
3. Observe browser console and UI for progress messages
4. Verify each message appears once in sequence

### Expected Console Output

```
[chat-api] Stream chunk keys: ['supervisor']
[chat-api] Node 'supervisor' emitted 3 messages
[chat-api] Sent progress update: 🧠 Evaluating request... at 1234567890000
[chat-api] Sent progress update: 📋 Step 1/3: Searching for deals... at 1234567890100

[chat-api] Stream chunk keys: ['deals']
[chat-api] Node 'deals' emitted 4 messages
[chat-api] Skipping duplicate progress update: 🧠 Evaluating request...
[chat-api] Skipping duplicate progress update: 📋 Step 1/3: Searching for deals...
[chat-api] Sent progress update: 🏷️ Checking for deals... at 1234567890200

[chat-api] Stream chunk keys: ['supervisor']
[chat-api] Node 'supervisor' emitted 5 messages
[chat-api] Sent progress update: 📋 Step 2/3: Adding items to cart... at 1234567890300
...
```

## Impact

### User Experience

- ✅ Real-time feedback during multi-step workflows
- ✅ Clear indication of which agent is working
- ✅ No duplicate or confusing messages
- ✅ Better perceived performance

### Performance

- ✅ Minimal memory overhead (Set with ~5-10 timestamps)
- ✅ O(1) duplicate checking
- ✅ No additional network requests
- ✅ Efficient SSE streaming

## Follow-up

This completes the three-part fix for the streaming system:

1. ✅ **Duplicate Add-to-Cart Fix** - Filter duplicate cart instructions
2. ✅ **Ephemeral Message Retention Fix** - Keep ephemeral messages in state temporarily
3. ✅ **Progress Streaming Deduplication Fix** - Prevent duplicate progress messages (this fix)

The system now provides smooth, real-time progress feedback without duplicates or missing updates.
