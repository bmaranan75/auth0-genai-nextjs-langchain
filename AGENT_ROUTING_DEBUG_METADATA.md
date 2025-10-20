# Agent Routing Debug Metadata Implementation

## Overview

Enhanced the system to track and expose agent routing decisions in dev metadata for better debugging and visibility into the LangGraph workflow orchestration.

## What Was Added

### 1. **Dev Metadata - Agent Routing Decision Type**

Added a new metadata type `agent_routing_decision` that captures when specialized agents decide where to route next in the workflow.

**Location**: `/src/app/api/chat-stream/route.ts`

**Metadata Structure**:

```typescript
{
  type: 'agent_routing_decision',
  data: {
    fromAgent: string,           // e.g., 'deals', 'catalog', 'cart_and_checkout'
    toAgent: string,              // e.g., 'supervisor', 'cart_and_checkout', '__end__'
    workflowContext: string,      // Current workflow context
    dealData: {
      applied: boolean,
      pending: boolean,
      type: string
    } | null,
    pendingProduct: {
      product: string,
      quantity: number
    } | null,
    cartData: string | null       // 'present' or null
  },
  timestamp: number
}
```

**Detection Logic**:

- Triggers when a chunk has a `next` field that's not `__end__`
- Must have messages array with at least one message
- Last message must be from a specialized agent (not supervisor, planner, or user)
- Extracts routing decision details including state context

### 2. **Console Logging for All Agent Nodes**

Added comprehensive routing decision logging at every return point in all agent nodes:

#### **Catalog Agent**

```typescript
console.log('[catalogNode] ROUTING DECISION:', {
  fromAgent: 'catalog',
  toAgent: END,
  reason: 'Task completed',
  state: {
    workflowContext,
    pendingProduct: !!pendingProduct,
    dealData: !!dealData,
  },
});
```

#### **Cart & Checkout Agent** (3 return points)

1. **Checkout Success (Structured)**
   - Routes to: `notification_agent`
   - Reason: "Structured checkout success - routing to notification"

2. **Checkout Failure**
   - Routes to: `END`
   - Reason: "Checkout failure - ending workflow"

3. **Checkout Success (Text Fallback)**
   - Routes to: `notification_agent`
   - Reason: "Checkout success (text fallback) - routing to notification"

4. **Normal Cart Operation**
   - Routes to: `END`
   - Reason: "Cart operation completed - ending workflow"

#### **Deals Agent** (4 return points)

1. **No Product Information**
   - Routes to: `END`
   - Reason: "No product information available - ending workflow"

2. **Auto-Apply Intent**
   - Routes to: `supervisor`
   - Reason: "Auto-apply intent - routing to supervisor for cart delegation"

3. **Manual Confirmation Required**
   - Routes to: `END`
   - Reason: "Manual confirmation required - ending workflow"

4. **Direct to Cart**
   - Routes to: `cart_and_checkout`
   - Reason: "Deal found without confirmation - direct to cart"

5. **No Deals Available**
   - Routes to: `END`
   - Reason: "No deals available - ending workflow"

#### **Payment Agent**

```typescript
console.log('[paymentNode] ROUTING DECISION:', {
  fromAgent: 'payment',
  toAgent: END,
  reason: 'Payment operation completed',
  state: {
    workflowContext,
    pendingProduct: !!pendingProduct,
    dealData: !!dealData,
    cartData: !!cartData,
  },
});
```

#### **Notification Agent** (2 return points)

1. **No Notification Data**
   - Routes to: `END`
   - Reason: "No notification data - ending workflow"

2. **After Sending Notification**
   - Routes to: `END`
   - Reason: "Notification sent successfully" or "Notification send failed"

## Benefits

### 1. **Debugging**

- See exactly what routing decisions each agent is making
- Understand why agents chose specific paths
- Track workflow state at each routing decision point

### 2. **Dev Tools Visibility**

- Agent routing decisions appear in the dev metadata stream
- Can visualize the full routing flow in real-time
- Capture both supervisor decisions AND agent decisions

### 3. **Troubleshooting**

- Quickly identify unexpected routing behaviors
- See the state context that influenced routing decisions
- Understand complex workflow paths (e.g., deals → supervisor → cart)

## Example Output

### Console Logs

```
[dealsNode] ROUTING DECISION: {
  fromAgent: 'deals',
  toAgent: 'supervisor',
  reason: 'Auto-apply intent - routing to supervisor for cart delegation',
  state: {
    workflowContext: 'add_to_cart_with_deals',
    pendingProduct: { product: 'apples', quantity: 5 },
    dealData: { applied: true, type: 'product_deal' }
  }
}
```

### Dev Metadata

```json
{
  "type": "agent_routing_decision",
  "data": {
    "fromAgent": "deals",
    "toAgent": "supervisor",
    "workflowContext": "add_to_cart_with_deals",
    "dealData": {
      "applied": true,
      "pending": false,
      "type": "product_deal"
    },
    "pendingProduct": {
      "product": "apples",
      "quantity": 5
    },
    "cartData": null
  },
  "timestamp": 1729365421234
}
```

## Usage

### In Dev Tools

The routing decisions will automatically appear in your dev metadata stream. You can filter by:

- `type: 'agent_routing_decision'` - Agent routing decisions
- `type: 'supervisor_decision'` - Supervisor routing decisions
- `type: 'planner_recommendation'` - Planner recommendations

### In Logs

Search for `ROUTING DECISION` to see all routing decisions across all agents:

```bash
grep "ROUTING DECISION" your-log-file.log
```

## Architecture Flow

```
User Request
    ↓
Planner (provides recommendation)
    ↓
Supervisor (makes delegation decision)
    ↓
Specialized Agent (executes task)
    ↓
Agent Routing Decision ← **NEW: Now captured in metadata**
    ↓
Supervisor (receives agent's next recommendation)
    ↓
Supervisor Decision (delegates to next agent or ends)
```

## Testing

To test the new metadata:

1. **Start the dev server**:

   ```bash
   npm run dev
   ```

2. **Make a request** that triggers multiple agents:

   ```
   "Check if there are any deals on apples, if so add 5 to my cart"
   ```

3. **Check dev metadata** in browser dev tools or API response:
   - Look for `agent_routing_decision` events
   - Verify `fromAgent` and `toAgent` values
   - Check state context is included

4. **Check console logs**:
   - Look for `[<agentName>] ROUTING DECISION:` logs
   - Verify detailed state information is logged

## Files Modified

1. **`/src/app/api/chat-stream/route.ts`**
   - Added `agent_routing_decision` metadata type
   - Enhanced metadata extraction logic

2. **`/src/lib/agents/supervisor.ts`**
   - Added routing decision logs to all agent nodes:
     - `catalogNode`
     - `cartAndCheckoutNode` (4 return points)
     - `dealsNode` (5 return points)
     - `paymentNode`
     - `notificationAgent` (2 return points)

## Related Documentation

- See `ARCHITECTURE_OVERVIEW.md` for overall system architecture
- See `SUPERVISOR_ORCHESTRATION_ANALYSIS.md` for supervisor routing logic
- See `DEV_METADATA_VISUAL_GUIDE.md` for dev metadata documentation
