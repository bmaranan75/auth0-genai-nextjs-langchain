# Ephemeral Status Messaging - Complete Implementation Guide

## 🎯 Overview

This implementation provides a **production-ready ephemeral status messaging system** for streaming real-time agent progress to users without polluting conversation history or LLM context.

## ✨ Key Features

✅ **Real-time Progress Feedback** - Users see what's happening as agents work  
✅ **Auto-Dismissing Status** - Ephemeral messages disappear after timeout  
✅ **Clean History** - Status messages never saved to conversation memory  
✅ **Type-Safe Events** - NDJSON streaming with typed events  
✅ **Agent-Aware** - Each status tagged with originating agent  
✅ **Easy Integration** - Drop-in utilities for existing agent code

---

## 📁 Files Created/Modified

### New Files

1. **`/src/lib/agents/statusEmitter.ts`** - Status message utilities
2. **`/src/hooks/useStreamingChat.ts`** - React hook for streaming chat
3. **`/EPHEMERAL_STATUS_IMPLEMENTATION.md`** - Architecture documentation
4. **`/EXAMPLES_EPHEMERAL_STATUS.md`** - Usage examples
5. **`/test-ephemeral-status.js`** - Integration test

### Modified Files

1. **`/src/lib/agents/supervisor.ts`**
   - Added `ephemeral` and `autoRemoveMs` to `AnnotatedMessage` interface
   - Updated `createProgressMessage()` to mark messages as ephemeral
   - Modified `SupervisorState.messages` reducer to filter ephemeral messages

2. **`/src/app/api/chat-stream/route.ts`**
   - Added `isEphemeralChunk()` helper
   - Enhanced status event emission with metadata
   - Improved keyword detection for status messages

---

## 🚀 Quick Start

### 1. Using Status Emitter in Agents

```typescript
import {createStatusEmitter, StatusTemplates} from '@/lib/agents/statusEmitter';

async function catalogNode(state: typeof SupervisorState.State) {
  const status = createStatusEmitter('catalog');
  const statusMessages = [];

  // Emit status updates
  statusMessages.push(status.emit(StatusTemplates.catalog.searching));
  const results = await searchCatalog(query);
  statusMessages.push(
    status.emit(StatusTemplates.catalog.found(results.length)),
  );

  // Create permanent response
  const finalResponse = annotateMessage(
    new AIMessage(`Found ${results.length} products`),
    'assistant',
    'catalog',
  );

  return {
    messages: [...statusMessages, finalResponse],
    next: 'supervisor',
  };
}
```

### 2. Using Streaming Hook in React

```tsx
import {useStreamingChat} from '@/hooks/useStreamingChat';

function ChatWindow() {
  const {messages, sendMessage, isLoading} = useStreamingChat({
    endpoint: '/api/chat-stream',
    conversationId: 'conv-123',
  });

  return (
    <>
      {messages.map(msg => (
        <ChatBubble key={msg.id} message={msg} ephemeral={msg.isEphemeral} />
      ))}
    </>
  );
}
```

### 3. Testing the Implementation

```bash
# Start your development server
npm run dev

# In another terminal, run the test
node test-ephemeral-status.js
```

---

## 🏗️ Architecture

### Event Flow

```
┌─────────────┐
│   Agent     │ Emits status messages with ephemeral=true
│  (catalog)  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Supervisor  │ Filters ephemeral from state.messages reducer
│   State     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Streaming  │ Detects ephemeral and emits as 'status' events
│    Route    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Client    │ Displays ephemeral messages with auto-dismiss
│  (React)    │
└─────────────┘
```

### Message Types

| Type    | Purpose                | Saved to History | Auto-Dismiss |
| ------- | ---------------------- | ---------------- | ------------ |
| message | Permanent conversation | ✅ Yes           | ❌ No        |
| status  | Ephemeral progress     | ❌ No            | ✅ Yes       |
| error   | Error notifications    | ❌ No            | ✅ Yes       |
| meta    | Internal metadata      | ❌ No            | N/A          |
| raw     | Fallback for unparsed  | ✅ Yes           | ❌ No        |

---

## 📚 API Reference

### `createStatusEmitter(agentName: string)`

Creates a status emitter for an agent.

```typescript
const status = createStatusEmitter('catalog');

// Emit basic status
status.emit('🔍 Searching...');

// Emit with custom timeout
status.emit('⏳ Processing...', 10000);

// Emit workflow step
status.step(1, 3, 'Checking deals');

// Emit completion
status.complete('Search complete');

// Emit error
status.error('Search failed');
```

### `StatusTemplates`

Pre-defined status messages for consistency.

```typescript
import {StatusTemplates} from '@/lib/agents/statusEmitter';

// Catalog agent
StatusTemplates.catalog.searching; // "🔍 Searching catalog..."
StatusTemplates.catalog.found(5); // "📦 Found 5 items"
StatusTemplates.catalog.complete; // "✅ Catalog search complete"

// Deals agent
StatusTemplates.deals.checking; // "🏷️ Checking for available deals..."
StatusTemplates.deals.found(2); // "🎉 Found 2 deals!"
StatusTemplates.deals.noneFound; // "📋 No deals available at this time"

// Cart agent
StatusTemplates.cart.adding; // "🛒 Adding items to cart..."
StatusTemplates.cart.updating; // "🔄 Updating cart..."
StatusTemplates.cart.complete; // "✅ Cart updated successfully"

// Supervisor
StatusTemplates.supervisor.routing; // "🧠 Analyzing request..."
StatusTemplates.supervisor.delegating('catalog'); // "📤 Routing to catalog..."
```

### `createWorkflowStatus(agentName, steps[])`

Creates a multi-step workflow tracker.

```typescript
const workflow = createWorkflowStatus('cart_and_checkout', [
  'Check deals',
  'Add to cart',
  'Calculate totals',
]);

const statusMessages = [
  ...workflow.start('Cart Addition'),
  workflow.step(0, 'Check deals'),
  workflow.step(1, 'Add to cart'),
  workflow.step(2, 'Calculate totals'),
  workflow.complete('Cart Addition'),
];
```

### `useStreamingChat(options)`

React hook for streaming chat with ephemeral messages.

```typescript
interface UseStreamingChatOptions {
  endpoint: string; // API endpoint (e.g., '/api/chat-stream')
  conversationId: string; // Conversation identifier
  userId?: string; // Optional user identifier
  onError?: (error: Error) => void;
  onStatusChange?: (isLoading: boolean) => void;
}

const {
  messages, // Array of ChatMessage (includes ephemeral)
  sendMessage, // (content: string) => Promise<void>
  isLoading, // boolean
  clearMessages, // () => void
} = useStreamingChat(options);
```

---

## 🎨 Visual Examples

### Status Message in UI

```
┌────────────────────────────────────────────┐
│ 🔍 Searching catalog...                    │  ← Ephemeral status
│ ├─ Agent: catalog                          │     (auto-dismiss 5s)
│ └─ Italic, semi-transparent                │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ 📦 Found 5 items                           │  ← Ephemeral status
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ Here are the 5 products I found:           │  ← Permanent message
│ 1. Apple - $2.99                           │     (stays in history)
│ 2. Banana - $1.50                          │
│ ...                                        │
└────────────────────────────────────────────┘
```

### Multi-Step Workflow

```
User: "Check for deals and add 3 apples to cart"

┌────────────────────────────────────────────┐
│ 🚀 Starting Cart Addition...               │  ← Workflow start (2s)
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ [1/3] Checking for available deals         │  ← Step 1 (3s)
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ [2/3] Adding items to cart                 │  ← Step 2 (3s)
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ [3/3] Calculating totals                   │  ← Step 3 (3s)
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ ✅ Cart Addition complete                  │  ← Complete (3s)
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ Added 3 apples with 20% deal ($7.20)      │  ← Permanent response
└────────────────────────────────────────────┘
```

---

## 🔧 Customization

### Custom Status Timeout

```typescript
// Short timeout (3 seconds) for quick updates
status.emit('✅ Done', 3000);

// Long timeout (10 seconds) for important info
status.emit('🔐 Waiting for authorization...', 10000);
```

### Custom Status Templates

```typescript
// Define your own templates
const MyStatusTemplates = {
  myAgent: {
    starting: '🚀 Starting process...',
    processing: (count: number) => `⚙️ Processing ${count} items...`,
    done: '✨ All done!',
  },
};

// Use in agent
status.emit(MyStatusTemplates.myAgent.starting);
status.emit(MyStatusTemplates.myAgent.processing(10));
```

### Custom Styling in UI

```tsx
function ChatBubble({message}: {message: ChatMessage}) {
  const getStyle = () => {
    if (!message.isEphemeral) {
      return 'bg-white border border-gray-200';
    }

    // Custom styling for ephemeral messages
    return cn(
      'bg-blue-50/50 border-l-2 border-blue-400',
      'opacity-80 italic text-sm',
      'transition-opacity duration-500',
    );
  };

  return (
    <div className={getStyle()}>
      {message.agent && (
        <span className="text-xs text-gray-500 font-mono">{message.agent}</span>
      )}
      <p>{message.content}</p>
    </div>
  );
}
```

---

## 🐛 Debugging

### Enable Verbose Logging

```typescript
// In supervisor.ts or agent file
console.log('[Agent] Emitting status:', statusMessage);
console.log('[Agent] Is ephemeral:', statusMessage.progress?.ephemeral);
```

### Monitor Stream Events

```javascript
// In browser console
fetch('/api/chat-stream', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({message: 'test', conversationId: 'debug'}),
})
  .then(r => r.body.getReader())
  .then(reader => {
    const decoder = new TextDecoder();
    function read() {
      reader.read().then(({done, value}) => {
        if (done) return;
        const text = decoder.decode(value);
        console.log('Stream chunk:', text);
        read();
      });
    }
    read();
  });
```

### Check Message History

```typescript
// Verify ephemeral messages are filtered
const permanentOnly = messages.filter(m => !m.progress?.ephemeral);
console.log('Permanent messages:', permanentOnly.length);
console.log('Total messages:', messages.length);
```

---

## ✅ Best Practices

1. **Keep Status Messages Short** - Under 100 characters
2. **Use Emojis** - Visual indicators improve UX (🔍 🛒 💳 ✅)
3. **Use Templates** - Consistency across agents
4. **Set Appropriate Timeouts** - 3s for quick updates, 10s for important info
5. **Always Filter History** - Remove ephemeral before LLM context
6. **Test Error Cases** - Ensure error statuses work correctly
7. **Monitor Performance** - Too many status updates can impact UX

---

## 🚨 Common Issues

### Status Messages Appear in LLM Context

**Problem:** Ephemeral messages are leaking into conversation history.

**Solution:** Check that `SupervisorState.messages` reducer is filtering properly:

```typescript
const permanent = combined.filter(
  msg => !msg.progress?.isProgressUpdate || msg.progress?.ephemeral !== true,
);
```

### Status Messages Don't Auto-Dismiss

**Problem:** Messages stay visible forever.

**Solution:** Ensure `useStreamingChat` hook schedules auto-removal:

```typescript
if (fullMessage.isEphemeral && fullMessage.autoRemoveMs) {
  scheduleAutoRemove(fullMessage.id, fullMessage.autoRemoveMs);
}
```

### Stream Events Not Typed

**Problem:** All events come through as 'raw' type.

**Solution:** Check `isStatusLike()` keywords and `isEphemeralChunk()` detection in route.

---

## 📊 Performance Considerations

- **Memory**: Ephemeral messages auto-clear, preventing memory leaks
- **Network**: Status events are small (<1KB each)
- **LLM Tokens**: Ephemeral messages never consume LLM context tokens
- **UI Updates**: React efficiently handles ephemeral message additions/removals

---

## 🎓 Learning Resources

1. **Architecture Overview**: See `EPHEMERAL_STATUS_IMPLEMENTATION.md`
2. **Code Examples**: See `EXAMPLES_EPHEMERAL_STATUS.md`
3. **Test Suite**: Run `node test-ephemeral-status.js`
4. **Source Code**: Check `src/lib/agents/statusEmitter.ts`

---

## 🔮 Future Enhancements

Potential improvements for the ephemeral status system:

- [ ] Progress bars for long-running operations
- [ ] Grouped status updates (collapse related messages)
- [ ] Sound notifications for important status changes
- [ ] Persistent status log (separate from chat history)
- [ ] Agent activity timeline visualization
- [ ] Customizable status categories beyond current types
- [ ] Status message priorities (low/medium/high visibility)
- [ ] Replay functionality to show status sequence

---

## 💬 Example User Experience

**Before (no status messages):**

```
User: Add 3 apples to cart
[30 second wait with no feedback]
Bot: Added 3 apples to your cart for $8.97
```

**After (with ephemeral status):**

```
User: Add 3 apples to cart
🏷️ Checking for available deals...
📦 Found 20% discount on apples!
🛒 Adding items to cart...
✅ Cart updated successfully
Bot: Added 3 apples to your cart for $7.17 (saved $1.80!)
```

**User sees real-time progress** while only the final message is saved to history. 🎉

---

## 🤝 Contributing

To extend the ephemeral status system:

1. Add new status templates to `statusEmitter.ts`
2. Update agent nodes to emit relevant status messages
3. Add keywords to `isStatusLike()` for automatic detection
4. Test with `test-ephemeral-status.js`
5. Update examples in documentation

---

## 📝 Summary

This implementation provides a **complete, production-ready solution** for ephemeral status messaging in your LangChain/LangGraph application. Key benefits:

✨ **Better UX** - Users get real-time feedback  
🧠 **Cleaner Memory** - LLM context stays focused  
🔄 **Easy Integration** - Drop-in utilities for agents  
🎨 **Flexible Styling** - Customizable UI presentation  
🚀 **Performance** - Efficient auto-cleanup and filtering

**Start using it now** by importing `createStatusEmitter` in your agent code!
