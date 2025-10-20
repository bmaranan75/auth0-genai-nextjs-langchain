# Agent Routing Debug Metadata - Visual Guide

## 🎯 What You'll See in Dev Metadata

### Flow Example: "Check deals on apples and add 5 to cart if available"

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. PLANNER RECOMMENDATION                                       │
├─────────────────────────────────────────────────────────────────┤
│ Type: planner_recommendation                                    │
│ Data: {                                                         │
│   action: "delegate",                                           │
│   targetAgent: "deals",                                         │
│   confidence: 0.92,                                            │
│   reasoning: "User wants to check deals and add to cart"       │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. SUPERVISOR DECISION                                          │
├─────────────────────────────────────────────────────────────────┤
│ Type: supervisor_decision                                       │
│ Data: {                                                         │
│   targetAgent: "deals",                                         │
│   workflowContext: "check_deals",                              │
│   pendingProduct: { product: "apples", quantity: 5 }          │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    [Deals Agent Executes]
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. AGENT ROUTING DECISION ⭐ NEW                               │
├─────────────────────────────────────────────────────────────────┤
│ Type: agent_routing_decision                                    │
│ Data: {                                                         │
│   fromAgent: "deals",                                           │
│   toAgent: "supervisor",                                        │
│   workflowContext: "add_to_cart_with_deals",                   │
│   dealData: {                                                   │
│     applied: true,                                              │
│     type: "product_deal"                                        │
│   },                                                            │
│   pendingProduct: {                                             │
│     product: "apples",                                          │
│     quantity: 5                                                 │
│   }                                                             │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. SUPERVISOR DECISION                                          │
├─────────────────────────────────────────────────────────────────┤
│ Type: supervisor_decision                                       │
│ Data: {                                                         │
│   targetAgent: "cart_and_checkout",                            │
│   workflowContext: "add_to_cart_with_deals",                   │
│   dealData: "present",                                          │
│   pendingProduct: "present"                                     │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                 [Cart Agent Executes]
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. AGENT ROUTING DECISION ⭐ NEW                               │
├─────────────────────────────────────────────────────────────────┤
│ Type: agent_routing_decision                                    │
│ Data: {                                                         │
│   fromAgent: "cart_and_checkout",                              │
│   toAgent: "__end__",                                          │
│   workflowContext: null,                                        │
│   dealData: { applied: true, type: "product_deal" },          │
│   pendingProduct: null,                                         │
│   cartData: "present"                                           │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

## 🔍 Console Log Output

### Deals Agent Decision

```
[dealsNode] Auto-apply intent detected - auto-proceeding to cart (no confirmation needed)
[dealsNode] Auto-apply intent: true
[dealsNode] Complex workflow: true
[dealsNode] Pending product: { product: 'apples', quantity: 5 }

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

### Cart Agent Decision

```
[cartAndCheckoutNode] Auto-proceeding with deal application for complex workflow

[cartAndCheckoutNode] ROUTING DECISION: {
  fromAgent: 'cart_and_checkout',
  toAgent: '__end__',
  reason: 'Cart operation completed - ending workflow',
  state: {
    workflowContext: null,
    pendingProduct: false,
    dealData: true,
    cartData: true
  }
}
```

## 📊 Routing Decision Matrix

### All Possible Agent Routing Decisions

| Agent                  | Possible Next Values                             | Scenarios                                                                                          |
| ---------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **catalog**            | `__end__`                                        | Always ends after showing products                                                                 |
| **deals**              | `supervisor`<br>`cart_and_checkout`<br>`__end__` | • Auto-apply → `supervisor`<br>• Direct cart → `cart_and_checkout`<br>• No deals/error → `__end__` |
| **cart_and_checkout**  | `notification_agent`<br>`__end__`                | • Checkout success → `notification_agent`<br>• Cart operation → `__end__`                          |
| **payment**            | `__end__`                                        | Always ends after payment operation                                                                |
| **notification_agent** | `__end__`                                        | Always ends after notification                                                                     |

## 🎨 Metadata Type Comparison

### Before Enhancement

```json
{
  "type": "supervisor_decision",
  "data": {
    "targetAgent": "cart_and_checkout",
    "workflowContext": "add_to_cart_with_deals"
  }
}
```

**Limited to**: Only supervisor's delegation decisions

### After Enhancement

```json
{
  "type": "agent_routing_decision",
  "data": {
    "fromAgent": "deals",
    "toAgent": "supervisor",
    "workflowContext": "add_to_cart_with_deals",
    "dealData": {"applied": true, "type": "product_deal"},
    "pendingProduct": {"product": "apples", "quantity": 5}
  }
}
```

**Includes**: Agent's routing decision + full state context

## 🔧 How to Use for Debugging

### 1. Track Unexpected Routing

```javascript
// Filter dev metadata for agent routing decisions
const agentDecisions = metadata.filter(
  m => m.type === 'agent_routing_decision',
);

// Check if deals agent routed correctly
const dealsDecision = agentDecisions.find(d => d.data.fromAgent === 'deals');
if (dealsDecision.data.toAgent !== 'supervisor') {
  console.error('Unexpected routing from deals agent:', dealsDecision);
}
```

### 2. Visualize Complete Flow

```javascript
// Build routing history
const routingHistory = metadata
  .filter(m =>
    [
      'agent_routing_decision',
      'supervisor_decision',
      'planner_recommendation',
    ].includes(m.type),
  )
  .map(m => ({
    timestamp: m.timestamp,
    type: m.type,
    from: m.data.fromAgent || m.data.agent || 'planner',
    to: m.data.toAgent || m.data.targetAgent,
    context: m.data.workflowContext,
  }));

console.table(routingHistory);
```

### 3. Analyze State Transitions

```javascript
// Track workflow context changes
const agentDecisions = metadata.filter(
  m => m.type === 'agent_routing_decision',
);
const contextChanges = agentDecisions.map(d => ({
  agent: d.data.fromAgent,
  context: d.data.workflowContext,
  dealStatus: d.data.dealData?.applied
    ? 'applied'
    : d.data.dealData?.pending
      ? 'pending'
      : 'none',
}));

console.log('Context Evolution:', contextChanges);
```

## 🎯 Real-World Examples

### Example 1: Simple Catalog Search

```
User: "Show me apples"

Metadata Stream:
1. planner_recommendation → delegate to "catalog"
2. supervisor_decision → route to "catalog"
3. agent_routing_decision → catalog to __end__ ✅
```

### Example 2: Checkout Flow

```
User: "Checkout my cart"

Metadata Stream:
1. planner_recommendation → delegate to "cart_and_checkout"
2. supervisor_decision → route to "cart_and_checkout"
3. agent_routing_decision → cart to "notification_agent" ✅
4. supervisor_decision → route to "notification_agent"
5. agent_routing_decision → notification to __end__ ✅
```

### Example 3: Complex Workflow with Deals

```
User: "Check deals on bananas and add 3 to cart if available"

Metadata Stream:
1. planner_recommendation → delegate to "deals"
2. supervisor_decision → route to "deals"
3. agent_routing_decision → deals to "supervisor" ✅
4. supervisor_decision → route to "cart_and_checkout"
5. agent_routing_decision → cart to __end__ ✅
```

## 🚨 Common Debugging Scenarios

### Scenario 1: Unexpected Loop

**Symptom**: Same agent appears multiple times

```javascript
const agentCounts = {};
metadata
  .filter(m => m.type === 'agent_routing_decision')
  .forEach(m => {
    agentCounts[m.data.fromAgent] = (agentCounts[m.data.fromAgent] || 0) + 1;
  });
// Check if any agent appears > 2 times
```

### Scenario 2: Wrong Agent Delegation

**Symptom**: Agent routes to unexpected target

```javascript
// Expected: deals → supervisor
// Actual: deals → __end__

const dealsDecision = metadata.find(
  m => m.type === 'agent_routing_decision' && m.data.fromAgent === 'deals',
);
console.log('Deals routing:', dealsDecision.data.toAgent);
console.log('Reason:', dealsDecision.data.reason); // Check console logs
```

### Scenario 3: Missing State Context

**Symptom**: Agent makes decision without proper context

```javascript
const cartDecision = metadata.find(
  m =>
    m.type === 'agent_routing_decision' &&
    m.data.fromAgent === 'cart_and_checkout',
);
console.log('Had deal data?', !!cartDecision.data.dealData);
console.log('Had pending product?', !!cartDecision.data.pendingProduct);
```

## 📝 Best Practices

1. **Always check both logs and metadata**
   - Logs have detailed reasoning
   - Metadata has structured data for analysis

2. **Track the full routing chain**
   - planner → supervisor → agent → supervisor → agent...
   - Look for inconsistencies in the chain

3. **Verify state propagation**
   - Check that dealData/pendingProduct persist correctly
   - Ensure workflowContext transitions make sense

4. **Look for routing reasons**
   - Console logs include human-readable reasons
   - Use these to understand unexpected routing

## 🔗 Related Features

- **Planner Recommendations**: Initial routing suggestions
- **Supervisor Decisions**: Final delegation choices
- **Agent Transitions**: When messages move between agents
- **Workflow Context**: State machine tracking
- **Agent Routing Decisions**: ⭐ NEW - Agent's own routing choices
