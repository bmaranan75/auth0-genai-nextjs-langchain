# Ephemeral Status Streaming Implementation Fix

## Problem

Ephemeral status messages were not appearing in the chatbot UI. The supervisor was creating progress messages (like "🧠 Evaluating request...", "🔍 Checking for deals...", etc.) but they weren't being streamed to the frontend.

## Root Cause

1. **API was using `invoke()` instead of `stream()`**: The chat API route was using `agent.invoke()` which returns all messages at once after completion, rather than streaming them in real-time.
2. **Frontend wasn't handling streaming**: The UI was only expecting JSON responses, not Server-Sent Events (SSE) streams.
3. **Only final message was extracted**: The API was extracting only the last message from the result, discarding all intermediate progress messages.

## Solution

### 1. Backend Changes (`/src/app/api/chat/route.ts`)

- **Switched to streaming API**: Changed from `agent.invoke()` to `agent.stream()`
- **Implemented SSE (Server-Sent Events)**: Created a `ReadableStream` that emits events to the client
- **Stream progress messages**: The API now:
  - Processes each chunk from the graph stream
  - Detects progress messages by checking `progress?.isProgressUpdate && progress?.ephemeral`
  - Sends them immediately to the client via SSE with `type: 'progress'`
  - Sends the final message with `type: 'message'` when stream completes
  - Sends `type: 'done'` to signal completion

### 2. Frontend Changes (`/src/components/chat-window.tsx`)

- **Added SSE handling**: Detects streaming responses by checking `Content-Type: text/event-stream`
- **Real-time progress display**:
  - Parses SSE messages from the stream
  - Creates ephemeral UI messages for `type: 'progress'` events
  - Auto-removes progress messages after 5 seconds
  - Displays final assistant message after stream completes
- **Backward compatibility**: Falls back to JSON responses if SSE is not used

### 3. How It Works

#### Flow:

```
User Input → API Route → agent.stream() → Graph Execution
                                           ↓
                                    Supervisor Node
                                           ↓
                                  Creates Progress Messages
                                  (e.g., "🧠 Evaluating request...")
                                           ↓
                                    Stream Emits Chunk
                                           ↓
                                    API Detects Progress Message
                                           ↓
                                    SSE Event Sent to Client
                                           ↓
                                    Frontend Displays Ephemeral Message
                                           ↓
                                    Auto-removes after 5s
```

#### Message Types:

- **`type: 'progress'`**: Ephemeral status updates (shown briefly, then removed)
- **`type: 'message'`**: Final assistant response (persisted in chat history)
- **`type: 'error'`**: Error messages
- **`type: 'done'`**: Stream completion signal

## Key Implementation Details

### Progress Message Creation (supervisor.ts)

```typescript
function createProgressMessage(
  content: string,
  agent?: string,
  ephemeral: boolean = true,
): AnnotatedMessage {
  return {
    message: new AIMessage(content),
    role: 'assistant',
    agent: agent || 'supervisor',
    timestamp: Date.now(),
    progress: {
      isProgressUpdate: true,
      step: content,
      agent: agent || 'supervisor',
      ephemeral, // Marks as ephemeral (not saved to history)
      autoRemoveMs: 5000, // Auto-dismiss timeout for UI
    },
  };
}
```

### State Reducer Behavior

The supervisor state reducer filters out ephemeral messages to prevent memory bloat:

```typescript
messages: Annotation<Array<AnnotatedMessage>>({
  reducer: (x, y) => {
    const combined = x.concat(y);
    // Filter out ephemeral status messages to prevent memory bloat
    const permanent = combined.filter(
      msg =>
        !msg.progress?.isProgressUpdate || msg.progress?.ephemeral !== true,
    );
    return permanent.slice(-10);
  },
});
```

**Important**: LangGraph's streaming emits node outputs **before** the state reducer is applied, so ephemeral messages are visible in the stream even though they're filtered from persisted state.

### API SSE Implementation

```typescript
const sendSSE = (data: any) => {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(encoder.encode(message));
};

// In stream processing loop:
if (
  lastMsg &&
  lastMsg.progress?.isProgressUpdate &&
  lastMsg.progress?.ephemeral
) {
  const progressContent =
    typeof lastMsg.message?.content === 'string'
      ? lastMsg.message.content
      : String(lastMsg.message?.content || '');

  sendSSE({
    type: 'progress',
    content: progressContent,
    agent: lastMsg.agent || 'supervisor',
    timestamp: Date.now(),
  });
}
```

### Frontend SSE Handling

```typescript
// Check if response is streaming (SSE)
const contentType = response.headers.get('content-type');
if (contentType?.includes('text/event-stream')) {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  // Process stream chunks
  for await (const chunk of reader) {
    // Parse SSE messages
    if (data.type === 'progress') {
      // Add ephemeral progress message
      const progressMsg: LangChainMessage = {
        id: `progress-${Date.now()}`,
        role: 'system',
        content: data.content,
        isEphemeral: true,
      };

      setMessages(prev => [...prev, progressMsg]);

      // Auto-remove after 5 seconds
      setTimeout(() => {
        setMessages(prev => prev.filter(msg => msg.id !== progressMsg.id));
      }, 5000);
    }
  }
}
```

## Progress Messages Displayed

The supervisor now emits these ephemeral status messages during workflow execution:

### Initial Routing

- `🧠 Evaluating request...` (when first analyzing user input)
- `🔄 Evaluating next steps...` (when agent returns to supervisor)

### Agent Completion Messages

- `🏷️ Found deals, proceeding...`
- `🏷️ Deal search completed...`
- `🛒 Added items to cart...`
- `💳 Checkout completed...`
- `🛍️ Catalog search completed...`
- `💳 Payment processing completed...`
- `📧 Notifications sent...`

### Workflow-Specific Messages

- `🔍 Step 1/3: Searching for available deals...`
- `🛒 Step 2/3: Adding items to your cart...`
- `💳 Step 3/3: Proceeding to checkout...`
- `🛒 Managing your cart...`
- `💳 Processing checkout...`

### Agent-Specific Progress

- `🛍️ Searching our catalog...` (catalog node)
- `🏷️ Checking for deals...` (deals node)
- `🛒 Managing your cart...` (cart node)
- `💳 Managing payments...` (payment node)
- `📧 Sending notifications...` (notification node)

## Benefits

1. **Better UX**: Users see real-time feedback about what the system is doing
2. **Transparency**: Clear visibility into multi-step workflows
3. **Reduced perceived latency**: Progress indicators make wait times feel shorter
4. **Memory efficient**: Ephemeral messages don't bloat conversation history
5. **Backward compatible**: Falls back to JSON for non-streaming clients

## Testing

To verify the implementation works:

1. **Start the development server**: `npm run dev`
2. **Open the chat interface**
3. **Send a multi-step request** like: "Check for deals on apples and add them to my cart"
4. **Expected behavior**:
   - See "🧠 Evaluating request..." appear immediately
   - See "🔍 Step 1/3: Searching for available deals..."
   - See "🛒 Step 2/3: Adding items to your cart..."
   - Each message should auto-dismiss after ~5 seconds
   - Final response persists in chat history

## Next Steps

If ephemeral messages still don't appear, check:

1. **Browser console**: Look for SSE parsing errors
2. **Server logs**: Verify stream chunks are being emitted with progress messages
3. **Network tab**: Confirm response has `Content-Type: text/event-stream`
4. **Progress detection**: Ensure `progress?.isProgressUpdate && progress?.ephemeral` checks are working

## Related Files

- `/src/app/api/chat/route.ts` - SSE streaming implementation
- `/src/components/chat-window.tsx` - Frontend SSE handling
- `/src/lib/agents/supervisor.ts` - Progress message creation and streaming
