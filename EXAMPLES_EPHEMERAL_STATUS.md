# Ephemeral Status Messages - Implementation Examples

## Example 1: Basic Status Messages in Catalog Agent

```typescript
import {createStatusEmitter, StatusTemplates} from '@/lib/agents/statusEmitter';

async function catalogNode(state: typeof SupervisorState.State) {
  const {messages, userId, conversationId} = state as any;
  const status = createStatusEmitter('catalog');

  const statusMessages = [];

  // Emit searching status
  statusMessages.push(status.emit(StatusTemplates.catalog.searching));

  // Perform search
  const results = await searchCatalog(query);

  // Emit found status
  statusMessages.push(
    status.emit(StatusTemplates.catalog.found(results.length)),
  );

  // Create final response (permanent message)
  const finalResponse = annotateMessage(
    new AIMessage(`Here are the ${results.length} products I found: ...`),
    'assistant',
    'catalog',
  );

  // Return both ephemeral status messages and final response
  return {
    messages: [...statusMessages, finalResponse],
    next: 'supervisor',
  };
}
```

**Result in UI:**

```
[Status - Auto-dismiss] 🔍 Searching catalog...
[Status - Auto-dismiss] 📦 Found 5 items
[Permanent Message] Here are the 5 products I found: Apple ($2.99), Banana ($1.50), ...
```

---

## Example 2: Multi-Step Workflow with Progress

```typescript
import {createWorkflowStatus} from '@/lib/agents/statusEmitter';

async function cartAndCheckoutNode(state: typeof SupervisorState.State) {
  const {workflowContext, pendingProduct, dealData} = state as any;

  // Define workflow steps
  const steps = [
    'Checking for available deals',
    'Adding items to cart',
    'Calculating totals',
  ];

  const workflow = createWorkflowStatus('cart_and_checkout', steps);
  const statusMessages = [];

  // Start workflow
  statusMessages.push(...workflow.start('Cart Addition'));

  // Step 1: Check deals
  statusMessages.push(workflow.step(0, steps[0]));
  const deals = await checkDeals(pendingProduct);

  // Step 2: Add to cart
  statusMessages.push(workflow.step(1, steps[1]));
  const cart = await addToCart(pendingProduct, deals);

  // Step 3: Calculate totals
  statusMessages.push(workflow.step(2, steps[2]));
  const totals = calculateTotals(cart);

  // Complete workflow
  statusMessages.push(workflow.complete('Cart Addition'));

  // Final response
  const finalResponse = annotateMessage(
    new AIMessage(
      `Added ${pendingProduct.quantity} ${pendingProduct.product} to your cart. Total: $${totals}`,
    ),
    'assistant',
    'cart_and_checkout',
  );

  return {
    messages: [...statusMessages, finalResponse],
    cartData: cart,
    next: 'supervisor',
  };
}
```

**Result in UI:**

```
[Status - Auto-dismiss] 🚀 Starting Cart Addition...
[Status - Auto-dismiss] [1/3] Checking for available deals
[Status - Auto-dismiss] [2/3] Adding items to cart
[Status - Auto-dismiss] [3/3] Calculating totals
[Status - Auto-dismiss] ✅ Cart Addition complete
[Permanent Message] Added 3 apples to your cart. Total: $8.97
```

---

## Example 3: Custom Status with Long Timeout

```typescript
import {createStatusEmitter} from '@/lib/agents/statusEmitter';

async function paymentNode(state: typeof SupervisorState.State) {
  const status = createStatusEmitter('payment');
  const statusMessages = [];

  // Show authorization request with longer timeout (10 seconds)
  statusMessages.push(
    status.emit('🔐 Waiting for payment authorization...', 10000),
  );

  // Wait for authorization
  const authResult = await waitForAuthorization();

  if (authResult.approved) {
    // Success status with shorter timeout (3 seconds)
    statusMessages.push(status.complete('Payment authorized successfully'));
  } else {
    // Error status with longer timeout (10 seconds)
    statusMessages.push(status.error('Payment authorization was denied'));
  }

  // Final response
  const finalResponse = annotateMessage(
    new AIMessage(authResult.message),
    'assistant',
    'payment',
  );

  return {
    messages: [...statusMessages, finalResponse],
    next: authResult.approved ? 'notification_agent' : END,
  };
}
```

---

## Example 4: Conditional Status Based on Context

```typescript
async function dealsNode(state: typeof SupervisorState.State) {
  const {pendingProduct, workflowContext} = state as any;
  const status = createStatusEmitter('deals');
  const statusMessages = [];

  // Context-aware status message
  if (workflowContext === 'check_deals') {
    statusMessages.push(status.emit(StatusTemplates.deals.checking));
  } else {
    statusMessages.push(status.emit('🏷️ Looking for special offers...'));
  }

  const deals = await findDeals(pendingProduct);

  if (deals.length > 0) {
    statusMessages.push(status.emit(StatusTemplates.deals.found(deals.length)));
  } else {
    statusMessages.push(status.emit(StatusTemplates.deals.noneFound));
  }

  statusMessages.push(status.complete('Deal search complete'));

  const finalResponse = annotateMessage(
    new AIMessage(formatDealsMessage(deals)),
    'assistant',
    'deals',
  );

  return {
    messages: [...statusMessages, finalResponse],
    dealData: deals.length > 0 ? deals[0] : null,
    next: 'supervisor',
  };
}
```

---

## Example 5: Error Handling with Status

```typescript
async function catalogNode(state: typeof SupervisorState.State) {
  const status = createStatusEmitter('catalog');
  const statusMessages = [];

  statusMessages.push(status.emit('🔍 Searching catalog...'));

  try {
    const results = await searchCatalog(query);

    if (results.length === 0) {
      statusMessages.push(status.emit('📦 No products found'));
    } else {
      statusMessages.push(status.emit(`📦 Found ${results.length} items`));
    }

    const finalResponse = annotateMessage(
      new AIMessage(formatResults(results)),
      'assistant',
      'catalog',
    );

    return {
      messages: [...statusMessages, finalResponse],
      next: 'supervisor',
    };
  } catch (error) {
    // Error status with longer display time
    statusMessages.push(
      status.error('Failed to search catalog. Please try again.'),
    );

    const errorResponse = annotateMessage(
      new AIMessage('Sorry, I encountered an error searching the catalog.'),
      'assistant',
      'catalog',
    );

    return {
      messages: [...statusMessages, errorResponse],
      next: END,
    };
  }
}
```

---

## Example 6: Using in React Component with Streaming Hook

```tsx
import {useStreamingChat} from '@/hooks/useStreamingChat';
import {toast} from 'sonner';

export function ChatWindow() {
  const {messages, sendMessage, isLoading} = useStreamingChat({
    endpoint: '/api/chat-stream',
    conversationId: 'conv-123',
    userId: 'user-456',
    onError: error => {
      toast.error(`Error: ${error.message}`);
    },
    onStatusChange: loading => {
      console.log('Loading state:', loading);
    },
  });

  return (
    <div className="chat-container">
      {messages.map(msg => (
        <ChatBubble
          key={msg.id}
          message={msg}
          className={msg.isEphemeral ? 'opacity-70 italic' : ''}
        />
      ))}

      <ChatInput onSubmit={text => sendMessage(text)} disabled={isLoading} />
    </div>
  );
}
```

---

## Example 7: Supervisor with Status Messages

```typescript
async function supervisor(state: typeof SupervisorState.State) {
  const {messages} = state as any;
  const statusMessages = [];

  // Determine if this is agent completion or initial routing
  const lastMessage = messages[messages.length - 1];
  const isAgentCompletion =
    lastMessage?.agent && lastMessage.agent !== 'supervisor';

  if (isAgentCompletion) {
    // Emit evaluation status
    statusMessages.push(
      createProgressMessage('🔄 Evaluating next steps...', 'supervisor'),
    );
  } else {
    // Emit routing status
    statusMessages.push(
      createProgressMessage('🧠 Analyzing request...', 'supervisor'),
    );
  }

  // Routing logic...
  const nextAgent = await determineNextAgent(state);

  // Emit delegation status
  statusMessages.push(
    createProgressMessage(`📤 Routing to ${nextAgent}...`, 'supervisor'),
  );

  return {
    messages: statusMessages,
    next: nextAgent,
  };
}
```

---

## Key Patterns and Best Practices

### 1. Always Use Status Emitter

```typescript
// ✅ Good: Use status emitter
const status = createStatusEmitter('my_agent');
statusMessages.push(status.emit('Processing...'));

// ❌ Bad: Manual message creation
statusMessages.push({
  message: new AIMessage('Processing...'),
  // ... missing ephemeral markers
});
```

### 2. Keep Status Messages Short

```typescript
// ✅ Good: Concise with emoji
status.emit('🔍 Searching products...');

// ❌ Bad: Too verbose
status.emit(
  'I am now searching through the product catalog database to find items matching your query...',
);
```

### 3. Use Templates for Consistency

```typescript
// ✅ Good: Use predefined templates
status.emit(StatusTemplates.catalog.searching);

// ✅ Also good: Custom but consistent format
status.emit('🏷️ Checking deals...');
```

### 4. Handle Errors Gracefully

```typescript
try {
  // ... operation
  statusMessages.push(status.complete('Operation complete'));
} catch (error) {
  statusMessages.push(status.error('Operation failed'));
}
```

### 5. Filter Ephemeral from History

```typescript
// ✅ Always filter before sending to LLM or saving
const permanentMessages = messages.filter(m => !m.progress?.ephemeral);
```

---

## Testing Ephemeral Messages

```typescript
// test-ephemeral-status.js
async function testEphemeralStatus() {
  const response = await fetch('http://localhost:3000/api/chat-stream', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      message: 'Add 3 apples to my cart',
      conversationId: 'test-123',
    }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const {done, value} = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const lines = text.split('\n').filter(Boolean);

    for (const line of lines) {
      const event = JSON.parse(line);
      console.log(`[${event.type}]`, event.payload);

      if (event.type === 'status') {
        console.log(`  → Ephemeral: ${event.payload.ephemeral}`);
        console.log(`  → Auto-remove: ${event.payload.autoRemoveMs}ms`);
      }
    }
  }
}

testEphemeralStatus();
```

---

## Visual Styling Examples

```tsx
// ChatBubble component with ephemeral styling
function ChatBubble({message}: {message: ChatMessage}) {
  const getStyle = () => {
    if (!message.isEphemeral) {
      return 'bg-white dark:bg-gray-800 border border-gray-200';
    }

    switch (message.ephemeralType) {
      case 'status':
        return 'bg-blue-50 dark:bg-blue-950/30 border-l-2 border-blue-500 opacity-80 italic';
      case 'error':
        return 'bg-red-50 dark:bg-red-950/30 border-l-2 border-red-500';
      case 'progress':
        return 'bg-purple-50 dark:bg-purple-950/30 border-l-2 border-purple-500 opacity-70';
      default:
        return 'bg-gray-50 dark:bg-gray-900/30 opacity-60';
    }
  };

  return (
    <div className={`rounded-lg p-3 my-2 ${getStyle()}`}>
      {message.agent && (
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          {message.agent}
        </span>
      )}
      <p>{message.content}</p>
    </div>
  );
}
```
