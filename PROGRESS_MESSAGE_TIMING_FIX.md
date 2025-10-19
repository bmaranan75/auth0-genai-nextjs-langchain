# Progress Message Timing Fix

## Issue

User reported seeing only "Agent task completed..." messages instead of seeing status updates BEFORE agents start working (e.g., "Checking for deals..." when the deals agent is about to be called).

## Root Cause

Progress messages were being created **inside agent node functions** (catalogNode, cartAndCheckoutNode, dealsNode, paymentNode), which meant they were only added to state AFTER the agent completed its work. This is because LangGraph emits state snapshots after each node finishes execution.

### Timeline Problem:

```
User sends request
  ↓
Supervisor routes to "deals"
  ↓
[LangGraph transitions to deals node]
  ↓
dealsNode() starts executing
  ↓
dealsNode() creates progress message "🏷️ Checking for deals..."
  ↓
dealsNode() calls LangGraph agent (takes 2-5 seconds)
  ↓
dealsNode() returns with progress message
  ↓
[LangGraph emits state chunk] ← User ONLY sees message NOW (too late!)
```

The user only saw progress messages AFTER agents finished, not BEFORE they started.

## Solution

Move progress message creation from **agent nodes** to the **supervisor routing logic**. Create agent-specific progress messages in the supervisor BEFORE returning the routing decision. This ensures messages are in the state chunk when the supervisor completes, not when the agent completes.

### Fixed Timeline:

```
User sends request
  ↓
Supervisor analyzes request
  ↓
Supervisor decides to route to "deals"
  ↓
Supervisor creates progress message "🏷️ Checking for deals..."
  ↓
Supervisor returns with progress message
  ↓
[LangGraph emits state chunk] ← User sees message IMMEDIATELY!
  ↓
[LangGraph transitions to deals node]
  ↓
dealsNode() starts executing
  ↓
dealsNode() calls LangGraph agent (takes 2-5 seconds)
  ↓
dealsNode() returns with agent response
  ↓
[LangGraph emits state chunk] ← User sees actual results
```

## Implementation

### 1. Added Helper Function

Created `getAgentProgressMessage()` to generate agent-specific progress messages:

```typescript
/**
 * Get agent-specific progress message for routing
 * This is shown to the user BEFORE the agent starts working
 */
function getAgentProgressMessage(
  agentName: string,
  context?: string,
): AnnotatedMessage {
  let message: string;

  switch (agentName) {
    case 'catalog':
      message = '🛍️ Searching our catalog...';
      break;
    case 'deals':
      message = '🏷️ Checking for deals...';
      break;
    case 'cart_and_checkout':
      if (context === 'process_checkout' || context === 'prepare_checkout') {
        message = '💳 Processing checkout...';
      } else {
        message = '🛒 Managing your cart...';
      }
      break;
    case 'payment':
      message = '💳 Managing payments...';
      break;
    case 'notification_agent':
      message = '📧 Sending notifications...';
      break;
    default:
      message = `⏳ Delegating to ${agentName}...`;
  }

  return createProgressMessage(message, 'supervisor');
}
```

### 2. Updated Supervisor Return Statements

Modified ALL return statements in the supervisor function to include agent-specific progress messages:

**Example - Planner Recommendation:**

```typescript
// Before
return {
  next: finalTargetAgent,
  messages: [...initialMessages, ...(lastAnnotated ? [lastAnnotated] : [])],
};

// After
const agentProgressMessage = getAgentProgressMessage(
  finalTargetAgent,
  workflowContext,
);
return {
  next: finalTargetAgent,
  messages: [
    ...initialMessages,
    agentProgressMessage,
    ...(lastAnnotated ? [lastAnnotated] : []),
  ],
};
```

**Example - Continuation Detection:**

```typescript
// Before
case 'deal_confirmation':
  return {
    next: 'cart_and_checkout',
    messages: [...initialMessages, ...(lastAnnotated ? [lastAnnotated] : [])]
  };

// After
case 'deal_confirmation':
  const dealConfirmProgressMessage = getAgentProgressMessage('cart_and_checkout', 'add_to_cart_with_deals');
  return {
    next: 'cart_and_checkout',
    messages: [...initialMessages, dealConfirmProgressMessage, ...(lastAnnotated ? [lastAnnotated] : [])]
  };
```

**Example - Final Routing:**

```typescript
// Before
return {
  next: selectedAgent,
  messages: [...initialMessages, ...(lastAnnotated ? [lastAnnotated] : [])],
};

// After
const finalProgressMessage = getAgentProgressMessage(
  selectedAgent,
  finalWorkflowContext,
);
return {
  next: selectedAgent,
  messages: [
    ...initialMessages,
    finalProgressMessage,
    ...(lastAnnotated ? [lastAnnotated] : []),
  ],
};
```

### 3. Removed Progress Messages from Agent Nodes

Removed progress message creation from all agent node functions since they're now handled by supervisor:

**Before (catalogNode):**

```typescript
async function catalogNode(state: typeof SupervisorState.State) {
  // Add ephemeral message for catalog processing
  const catalogProgressMessage = createProgressMessage(
    '🛍️ Searching our catalog...',
    'catalog',
  );

  // ... agent logic ...

  return {
    messages: [catalogProgressMessage, ...annotatedResponses],
    // ...
  };
}
```

**After (catalogNode):**

```typescript
async function catalogNode(state: typeof SupervisorState.State) {
  // ... agent logic ...

  return {
    messages: annotatedResponses, // No progress message here!
    // ...
  };
}
```

Applied same change to:

- `catalogNode()`
- `cartAndCheckoutNode()`
- `dealsNode()`
- `paymentNode()`

## Files Modified

### `/src/lib/agents/supervisor.ts`

**Added:**

- `getAgentProgressMessage()` helper function (lines ~218-250)

**Modified supervisor() return statements:**

- Planner recommendation handling (line ~748)
- Continuation detection - deal_confirmation case (line ~793)
- Continuation detection - checkout_flow case (line ~803)
- Continuation detection - add_to_cart case (line ~813)
- Workflow context override - add_to_cart_with_deals (line ~828)
- Workflow context override - awaiting_deal_confirmation (line ~848)
- Final routing fallback (line ~928)

**Modified agent node functions:**

- `catalogNode()` - Removed `catalogProgressMessage` (line ~961)
- `cartAndCheckoutNode()` - Removed `cartProgressMessage` (line ~989)
- `dealsNode()` - Removed `dealsProgressMessage` (line ~1242)
- `paymentNode()` - Removed `paymentProgressMessage` (line ~1424)

## Expected Behavior After Fix

### User Request: "add 8 apples to my cart and use any deals"

**User sees (in real-time):**

1. **Immediately (0ms)**: "🧠 Evaluating request..."
   - Supervisor starts analyzing

2. **~500ms**: "🏷️ Checking for deals..."
   - Supervisor routed to deals agent
   - **User sees this BEFORE agent starts working!**

3. **~3000ms**: "We found a deal: Buy 5 apples, get 20% off! Would you like to apply this?"
   - Deals agent completed and returned results

4. **User responds**: "yes"

5. **Immediately**: "🛒 Managing your cart..."
   - Supervisor routed to cart agent
   - **User sees this BEFORE cart agent starts!**

6. **~2000ms**: "Added 8 apples to your cart with 20% deal applied. Total: $X.XX"
   - Cart agent completed

## LangGraph Streaming Architecture

### State Emission Timing

```
┌─────────────────────────────────────────────────────────┐
│                   Supervisor Node                        │
│                                                          │
│  1. Analyze request                                     │
│  2. Decide: route to "deals"                            │
│  3. CREATE progress message: "Checking for deals..."    │ ← NEW!
│  4. Return state with message                           │
│                                                          │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
        [LangGraph emits state chunk]
                         │
                         ▼ (User sees: "Checking for deals...")
┌─────────────────────────────────────────────────────────┐
│                     Deals Node                           │
│                                                          │
│  1. Call deals agent (2-5 seconds)                      │
│  2. Process response                                    │
│  3. Return state with agent response                    │
│                                                          │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
        [LangGraph emits state chunk]
                         │
                         ▼ (User sees: actual deal results)
```

### Key Insight

**LangGraph emits state AFTER each node completes, not during node execution.**

Therefore:

- ✅ Messages created in supervisor → User sees immediately (when supervisor completes)
- ❌ Messages created in agent node → User sees delayed (when agent completes, too late)

## Integration with Previous Fixes

This fix builds on previous streaming improvements:

### Fix #1: Duplicate Add-to-Cart Prevention

- **What**: Filter duplicate cart instructions
- **Where**: cartAndCheckoutNode message filtering
- **Status**: ✅ Still working

### Fix #2: Ephemeral Message Retention

- **What**: Keep last 5 ephemeral messages in state
- **Where**: SupervisorState messages reducer
- **Status**: ✅ Still working

### Fix #3: Progress Streaming Deduplication

- **What**: Track sent message timestamps
- **Where**: Chat API route SSE handling
- **Status**: ✅ Still working

### Fix #4: Progress Message Timing (THIS FIX)

- **What**: Create progress messages in supervisor before routing
- **Where**: Supervisor return statements
- **Status**: ✅ NEW - Fixes timing issue

## Testing

### Manual Test

1. Start dev server: `npm run dev`
2. Send: "add 8 apples to my cart and use any deals"
3. Observe timing of progress messages:
   - Should see "Checking for deals..." IMMEDIATELY when supervisor routes
   - Should NOT see "Agent task completed..." as the first feedback
   - Should see agent-specific messages BEFORE long-running operations

### Expected Console Output

```bash
[chat-api] Stream chunk keys: ['supervisor']
[chat-api] Node 'supervisor' emitted 3 messages
[chat-api] Sent progress update: 🧠 Evaluating request... at 1234567890000
[chat-api] Sent progress update: 🏷️ Checking for deals... at 1234567890100
                                  ↑ NEW! Sent before deals agent starts
[chat-api] Stream chunk keys: ['deals']
[chat-api] Node 'deals' emitted 1 messages
[chat-api] Sent message: We found a deal: Buy 5 apples...
                         ↑ Actual agent response (not progress message)
```

## Impact

### User Experience

- ✅ **Immediate feedback**: User sees status BEFORE agents start working
- ✅ **Clear expectations**: User knows what's happening in real-time
- ✅ **No confusion**: No more seeing "Agent task completed..." as first message
- ✅ **Professional feel**: System feels responsive and well-designed

### Performance

- ✅ **No overhead**: Progress messages are lightweight
- ✅ **Better perceived performance**: Immediate feedback makes system feel faster
- ✅ **Reduced anxiety**: User knows system is working, even during long operations

## Summary

**Problem**: Progress messages appeared AFTER agents finished, not BEFORE they started.

**Root Cause**: Messages created inside agent nodes only appear when node completes (LangGraph streaming timing).

**Solution**: Create progress messages in supervisor routing logic BEFORE delegating to agents.

**Result**: Users see "Checking for deals..." immediately when supervisor routes, not after deals agent completes.

**Architecture**: Aligns with LangGraph's state emission model - state emitted after each node completes.
