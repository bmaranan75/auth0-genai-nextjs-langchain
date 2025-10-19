# Ephemeral Status Messaging Pattern Implementation

## Overview

This document describes the implementation of ephemeral status messages for real-time agent progress feedback without polluting conversation history.

## Architecture Pattern

### 1. **Message Types**

```typescript
type MessageEventType =
  | 'message' // Permanent conversation message
  | 'status' // Ephemeral status update (auto-dismiss)
  | 'progress' // Agent progress indicator
  | 'error' // Error messages
  | 'meta' // Internal metadata (filtered)
  | 'raw'; // Raw data fallback

interface StatusEvent {
  type: 'status';
  payload: {
    text: string;
    ephemeral: true;
    agent?: string;
    step?: string;
    autoRemoveMs?: number; // Auto-dismiss after N milliseconds
  };
}
```

### 2. **Agent-Side Implementation**

#### In Agent Nodes (supervisor.ts, etc.)

```typescript
// Emit ephemeral status updates during processing
function emitStatus(message: string, agent: string): AnnotatedMessage {
  return {
    message: new AIMessage(message),
    role: 'assistant',
    agent,
    timestamp: Date.now(),
    progress: {
      isProgressUpdate: true, // Marks as ephemeral
      step: message,
      agent,
    },
  };
}

// Example usage in agent:
const statusUpdates = [
  emitStatus('🔍 Searching catalog for products...', 'catalog'),
  emitStatus('📦 Found 5 matching items...', 'catalog'),
  emitStatus('✅ Catalog search complete', 'catalog'),
];

return {
  messages: [...statusUpdates, finalResponse],
  next: 'supervisor',
};
```

### 3. **Streaming Route Enhancement**

The route already detects status messages via:

- `isStatusLike()` function (emoji + keywords)
- `progress` property in AnnotatedMessage
- Emits as `{ type: 'status', payload: {...} }`

**Key Features:**

- Status messages are automatically wrapped in typed events
- Client receives NDJSON stream with typed events
- No changes needed to agent code for basic status

### 4. **Client-Side Implementation**

#### Chat Window Enhancement

```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isEphemeral?: boolean;
  ephemeralType?: 'status' | 'progress' | 'authorization';
  autoRemoveMs?: number;
}

// Handle streaming events
const handleStatusEvent = (event: StatusEvent) => {
  const statusMessage: ChatMessage = {
    id: `status-${Date.now()}-${Math.random()}`,
    role: 'system',
    content: event.payload.text,
    isEphemeral: true,
    ephemeralType: 'status',
    autoRemoveMs: event.payload.autoRemoveMs || 5000,
  };

  setMessages(prev => [...prev, statusMessage]);

  // Auto-remove after timeout
  setTimeout(() => {
    setMessages(prev => prev.filter(m => m.id !== statusMessage.id));
  }, statusMessage.autoRemoveMs);
};
```

### 5. **Filtering from History**

#### When Sending to Backend

```typescript
const messagesForContext = messages
  .filter(msg => !msg.isEphemeral) // Remove ephemeral
  .map(msg => ({
    role: msg.role,
    content: msg.content,
  }));
```

#### In Supervisor State Reducer

```typescript
messages: Annotation<Array<AnnotatedMessage>>({
  reducer: (x, y) => {
    const combined = x.concat(y);
    // Filter out ephemeral progress messages
    const permanent = combined.filter(m => !m.progress?.isProgressUpdate);
    return permanent.slice(-10); // Keep last 10
  },
});
```

## Implementation Steps

### Step 1: Enhance Agent Status Emission

Add status helper to agents that need progress feedback:

```typescript
// In catalog agent
async function catalogNode(state) {
  const statusMessages = [];

  statusMessages.push(
    createProgressMessage('🔍 Searching catalog...', 'catalog'),
  );
  const results = await searchCatalog(query);

  statusMessages.push(
    createProgressMessage(`📦 Found ${results.length} items`, 'catalog'),
  );

  return {
    messages: [...statusMessages, finalResponse],
    next: 'supervisor',
  };
}
```

### Step 2: Streaming Route (Already Implemented)

The route already handles status detection via:

- `isStatusLike()` detection
- `progress` property detection
- Type 'status' event emission

### Step 3: Client Streaming Consumer

Add NDJSON stream parsing with status handling:

```typescript
async function streamResponse(userMessage: string) {
  const response = await fetch('/api/chat-stream', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({message: userMessage, conversationId}),
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const {done, value} = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, {stream: true});
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const event = JSON.parse(line);

        switch (event.type) {
          case 'status':
            handleStatusEvent(event);
            break;
          case 'message':
            addPermanentMessage(event.payload.content);
            break;
          case 'error':
            handleError(event.payload);
            break;
        }
      } catch (e) {
        console.warn('Failed to parse event:', line);
      }
    }
  }
}
```

### Step 4: UI Styling

Add visual distinction for ephemeral messages:

```tsx
const getMessageStyle = (msg: ChatMessage) => {
  if (msg.isEphemeral && msg.ephemeralType === 'status') {
    return 'opacity-70 italic bg-muted/50 border-l-2 border-blue-500';
  }
  return 'bg-background';
};
```

## Benefits

1. **Real-time Feedback**: Users see what's happening without waiting
2. **Clean History**: Status messages don't clutter conversation memory
3. **Better UX**: Visual progress indicators improve perceived performance
4. **Debugging**: Easier to trace agent workflow in UI
5. **Flexible**: Easy to add new status types without schema changes

## Best Practices

1. **Use Emojis**: Visual indicators (🔍 🛒 💳) improve scanability
2. **Keep Short**: Status messages should be < 100 characters
3. **Progressive Disclosure**: Show steps as they happen, not all at once
4. **Auto-Dismiss**: Remove status messages after 3-10 seconds
5. **Semantic Types**: Use specific ephemeralType for different status categories
6. **Error Handling**: Status messages should never break the flow

## Example User Experience

```
User: "Add 3 apples to my cart"

[Status] 🔍 Checking for available deals...        [ephemeral, auto-dismiss]
[Status] 🏷️ Found 20% discount on apples!         [ephemeral, auto-dismiss]
[Status] 🛒 Adding items to cart...                [ephemeral, auto-dismiss]
```
