# 🚀 Ephemeral Status Messages - Quick Reference Card

## 📋 TL;DR

**Ephemeral status messages** let agents stream real-time progress to users without polluting conversation history.

---

## 🎯 Basic Usage (Copy-Paste Ready)

### In Any Agent Node

```typescript
import {createStatusEmitter, StatusTemplates} from '@/lib/agents/statusEmitter';

async function myAgentNode(state: typeof SupervisorState.State) {
  // 1. Create emitter
  const status = createStatusEmitter('my_agent');

  // 2. Emit status messages
  const statusMessages = [
    status.emit('🔍 Starting process...'),
    // ... do work ...
    status.emit('✅ Process complete'),
  ];

  // 3. Create permanent response
  const finalResponse = annotateMessage(
    new AIMessage('Final answer to user'),
    'assistant',
    'my_agent',
  );

  // 4. Return both
  return {
    messages: [...statusMessages, finalResponse],
    next: 'supervisor',
  };
}
```

### In React Component

```tsx
import {useStreamingChat} from '@/hooks/useStreamingChat';

function ChatWindow() {
  const {messages, sendMessage, isLoading} = useStreamingChat({
    endpoint: '/api/chat-stream',
    conversationId: conversationId,
  });

  return (
    <div>
      {messages.map(msg => (
        <div
          key={msg.id}
          className={msg.isEphemeral ? 'opacity-70 italic' : ''}>
          {msg.content}
        </div>
      ))}
    </div>
  );
}
```

---

## 🎨 Pre-Built Templates

```typescript
import {StatusTemplates} from '@/lib/agents/statusEmitter';

// Catalog
StatusTemplates.catalog.searching; // "🔍 Searching catalog..."
StatusTemplates.catalog.found(5); // "📦 Found 5 items"
StatusTemplates.catalog.complete; // "✅ Catalog search complete"

// Deals
StatusTemplates.deals.checking; // "🏷️ Checking for available deals..."
StatusTemplates.deals.found(2); // "🎉 Found 2 deals!"
StatusTemplates.deals.noneFound; // "📋 No deals available at this time"

// Cart
StatusTemplates.cart.adding; // "🛒 Adding items to cart..."
StatusTemplates.cart.updating; // "🔄 Updating cart..."
StatusTemplates.cart.complete; // "✅ Cart updated successfully"

// Checkout
StatusTemplates.checkout.preparing; // "💳 Preparing checkout..."
StatusTemplates.checkout.processing; // "⏳ Processing order..."
StatusTemplates.checkout.complete; // "✅ Order complete!"

// Supervisor
StatusTemplates.supervisor.routing; // "🧠 Analyzing request..."
StatusTemplates.supervisor.evaluating; // "🔄 Evaluating next steps..."
StatusTemplates.supervisor.delegating('catalog'); // "📤 Routing to catalog..."
```

---

## ⏱️ Custom Timeouts

```typescript
const status = createStatusEmitter('my_agent');

// Quick update (3 seconds)
status.emit('✅ Done', 3000);

// Standard (5 seconds - default)
status.emit('🔍 Processing...');

// Important (10 seconds)
status.emit('🔐 Waiting for authorization...', 10000);
```

---

## 📝 Multi-Step Workflows

```typescript
import {createWorkflowStatus} from '@/lib/agents/statusEmitter';

const workflow = createWorkflowStatus('my_agent', [
  'Step 1 description',
  'Step 2 description',
  'Step 3 description',
]);

const statusMessages = [
  ...workflow.start('My Workflow'), // "🚀 Starting My Workflow..."
  workflow.step(0, 'Step 1'), // "[1/3] Step 1 description"
  workflow.step(1, 'Step 2'), // "[2/3] Step 2 description"
  workflow.step(2, 'Step 3'), // "[3/3] Step 3 description"
  workflow.complete('My Workflow'), // "✅ My Workflow complete"
];
```

---

## 🎭 Status Types & Helpers

```typescript
const status = createStatusEmitter('my_agent');

// Basic emit
status.emit('Processing...');

// Step in workflow
status.step(1, 3, 'First step');

// Success
status.complete('Operation successful');

// Error
status.error('Operation failed');
```

---

## 🧹 Filtering Ephemeral Messages

```typescript
import {
  filterEphemeralMessages,
  isEphemeralMessage,
} from '@/lib/agents/statusEmitter';

// Filter array
const permanentOnly = filterEphemeralMessages(allMessages);

// Check single message
if (isEphemeralMessage(msg)) {
  console.log('This is ephemeral');
}

// Before sending to backend
const contextMessages = messages
  .filter(m => !m.isEphemeral)
  .map(m => ({role: m.role, content: m.content}));
```

---

## 🎨 UI Styling (Tailwind)

```tsx
function ChatBubble({message}: {message: ChatMessage}) {
  if (message.isEphemeral) {
    return (
      <div
        className="bg-blue-50 dark:bg-blue-950/30 border-l-2 border-blue-500 
                      opacity-80 italic text-sm p-3 rounded">
        {message.content}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 p-3 rounded">
      {message.content}
    </div>
  );
}
```

---

## 🧪 Testing

```bash
# Test the implementation
node test-ephemeral-status.js

# Or manually with curl
curl -X POST http://localhost:3000/api/chat-stream \
  -H "Content-Type: application/json" \
  -d '{"message": "test", "conversationId": "test-123"}' \
  --no-buffer
```

---

## ⚠️ Common Mistakes

### ❌ Don't Do This

```typescript
// Manual message creation (missing ephemeral markers)
const badMessage = {
  message: new AIMessage('Processing...'),
  role: 'assistant',
  agent: 'my_agent',
  timestamp: Date.now(),
  // ❌ Missing progress.ephemeral!
};
```

### ✅ Do This Instead

```typescript
// Use the status emitter
const status = createStatusEmitter('my_agent');
const goodMessage = status.emit('Processing...');
// ✅ Automatically includes all required fields
```

---

## 📊 Event Types in Stream

| Event Type | Description            | Ephemeral | Auto-Dismiss |
| ---------- | ---------------------- | --------- | ------------ |
| `message`  | Permanent conversation | ❌ No     | ❌ No        |
| `status`   | Progress update        | ✅ Yes    | ✅ Yes (5s)  |
| `error`    | Error notification     | ✅ Yes    | ✅ Yes (10s) |
| `meta`     | Internal metadata      | N/A       | N/A          |
| `raw`      | Unparsed fallback      | ❌ No     | ❌ No        |

---

## 🔑 Key Concepts

1. **Ephemeral = Not Saved** - Status messages don't go to LLM context
2. **Auto-Dismiss = User Friendly** - UI cleans up automatically
3. **Typed Events = Reliable** - Stream uses NDJSON with types
4. **Agent-Aware = Debuggable** - Know which agent did what

---

## 📁 Important Files

- **Utilities**: `src/lib/agents/statusEmitter.ts`
- **Hook**: `src/hooks/useStreamingChat.ts`
- **Supervisor**: `src/lib/agents/supervisor.ts` (state reducer)
- **Route**: `src/app/api/chat-stream/route.ts` (detection)
- **Tests**: `test-ephemeral-status.js`

---

## 📚 Full Documentation

- **Complete Guide**: `EPHEMERAL_STATUS_COMPLETE_GUIDE.md`
- **Examples**: `EXAMPLES_EPHEMERAL_STATUS.md`
- **Architecture**: `EPHEMERAL_STATUS_IMPLEMENTATION.md`
- **Diagrams**: `EPHEMERAL_STATUS_ARCHITECTURE_DIAGRAMS.md`
- **Summary**: `EPHEMERAL_STATUS_SUMMARY.md`

---

## 💡 Pro Tips

1. **Keep messages under 100 chars** - Short and scannable
2. **Use emojis** - Visual indicators improve UX (🔍 🛒 💳 ✅)
3. **Use templates** - Consistency across agents
4. **Test auto-dismiss** - Verify timeouts work correctly
5. **Always filter** - Remove ephemeral before LLM calls

---

## 🎯 Most Common Pattern

```typescript
async function myAgent(state: typeof SupervisorState.State) {
  const status = createStatusEmitter('my_agent');

  // 1. Emit status as you work
  const messages = [status.emit('🔍 Starting...')];

  // 2. Do actual work
  const result = await doWork();

  // 3. Emit completion status
  messages.push(status.complete('Work complete'));

  // 4. Create permanent response
  const response = annotateMessage(
    new AIMessage('Here is your result'),
    'assistant',
    'my_agent',
  );

  // 5. Return both ephemeral and permanent
  return {
    messages: [...messages, response],
    next: 'supervisor',
  };
}
```

---

## ✨ That's It!

**Three steps to ephemeral status:**

1. `import { createStatusEmitter } from '@/lib/agents/statusEmitter'`
2. `const status = createStatusEmitter('my_agent')`
3. `status.emit('🔍 Processing...')`

**Messages will automatically:**

- Stream to UI in real-time ⚡
- Display with special styling 🎨
- Auto-dismiss after timeout ⏱️
- Never appear in LLM context 🧠
