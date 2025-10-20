# Agent Routing Decision UI Guide

## Overview

The Dev Metadata UI now displays comprehensive agent routing decisions with a beautiful, organized interface. This guide shows what information is displayed and how to use it.

## UI Components

### 1. **Event Card Layout**

Each agent routing decision appears as an **orange-colored card** with a 🚦 traffic light icon.

```
┌─────────────────────────────────────────────────────┐
│ 🚦 Agent Routing Decision    14:23:45.123          │  ← Collapsed View
│ deals → supervisor [add_to_cart_with_deals]        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

When expanded, shows full details:

```
┌─────────────────────────────────────────────────────┐
│ 🚦 Agent Routing Decision    14:23:45.123          │
│                                                  ▼  │
│ ┌─────────────────┬─────────────────┐             │
│ │ From Agent:     │ To Agent:       │             │
│ │ deals           │ supervisor      │             │
│ └─────────────────┴─────────────────┘             │
│                                                     │
│ Workflow Context:                                   │
│ add_to_cart_with_deals                             │
│                                                     │
│ Deal Data:                                          │
│ ┌─────────────┬─────────────┐                     │
│ │ Applied: ✓ Yes │ Pending: ✗ No │               │
│ │ Type: product_deal          │                    │
│ └─────────────┴─────────────┘                     │
│                                                     │
│ Pending Product:                                    │
│ apples × 5                                          │
│                                                     │
│ ▸ Full JSON                                         │
└─────────────────────────────────────────────────────┘
```

### 2. **Information Display**

#### **From Agent & To Agent**

- Shows the routing path clearly
- Monospace font for agent names
- Examples: `deals → supervisor`, `catalog → __end__`, `cart_and_checkout → notification_agent`

#### **Workflow Context**

- Displays the current workflow state
- Examples:
  - `add_to_cart_with_deals`
  - `awaiting_deal_confirmation`
  - `check_deals`
  - `prepare_checkout`

#### **Deal Data** (when present)

- **Applied**: ✓ Yes (green) or ✗ No (gray)
- **Pending**: ⏳ Yes (yellow) or ✗ No (gray)
- **Type**: Shows deal type in monospace (e.g., `product_deal`, `no_deals_found`)

#### **Pending Product** (when present)

- Product name in bold
- Quantity displayed (e.g., `apples × 5`)

#### **Cart Data** (when present)

- Shows "✓ Present" in green if cart data exists
- Or displays the actual cart data structure

### 3. **Color Coding**

Each event type has its own color scheme:

| Event Type                 | Icon | Color      | Use Case                          |
| -------------------------- | ---- | ---------- | --------------------------------- |
| **Planner Recommendation** | 🧠   | Purple     | Initial routing suggestions       |
| **Supervisor Decision**    | 🎯   | Blue       | Supervisor's delegation decisions |
| **Agent Routing Decision** | 🚦   | **Orange** | **Agent's routing decisions**     |
| **Agent Transition**       | 🔄   | Green      | Agent handoffs                    |
| **Workflow Context**       | 📋   | Yellow     | State changes                     |

## Example Scenarios

### Scenario 1: Complex Workflow with Auto-Apply

**User says**: "Check deals on apples and add 5 to cart"

**Events displayed**:

1. **🧠 Planner Recommendation** (Purple)

   ```
   Action: delegate
   Target Agent: deals
   Confidence: 85%
   ```

2. **🎯 Supervisor Decision** (Blue)

   ```
   Target Agent: deals
   Workflow Context: check_deals
   ```

3. **🚦 Agent Routing Decision** (Orange) ← **NEW!**

   ```
   From Agent: deals
   To Agent: supervisor
   Workflow Context: add_to_cart_with_deals
   Deal Data:
     ✓ Applied: Yes
     ✗ Pending: No
     Type: product_deal
   Pending Product: apples × 5
   ```

4. **🎯 Supervisor Decision** (Blue)

   ```
   Target Agent: cart_and_checkout
   Workflow Context: add_to_cart_with_deals
   ```

5. **🚦 Agent Routing Decision** (Orange) ← **NEW!**
   ```
   From Agent: cart_and_checkout
   To Agent: notification_agent
   Workflow Context: null
   ```

### Scenario 2: Deal Confirmation Required

**User says**: "Add apples to cart"

**Events displayed**:

1. **🚦 Agent Routing Decision** (Orange)
   ```
   From Agent: deals
   To Agent: __end__
   Workflow Context: awaiting_deal_confirmation
   Deal Data:
     ✗ Applied: No
     ⏳ Pending: Yes
     Type: product_deal
   Pending Product: apples × 1
   ```

### Scenario 3: No Deals Available

**User says**: "Check deals on bananas"

**Events displayed**:

1. **🚦 Agent Routing Decision** (Orange)
   ```
   From Agent: deals
   To Agent: __end__
   Workflow Context: null
   Deal Data:
     ✗ Applied: No
     ✗ Pending: No
     Type: no_deals_found
   Pending Product: null
   ```

## How to Use

### 1. **Monitor Workflow Flow**

- Watch the routing path: planner → supervisor → agent → supervisor
- See what routing decision each agent makes
- Understand why agents chose specific paths

### 2. **Debug Issues**

- If workflow doesn't behave as expected, check agent routing decisions
- Look at the state context (dealData, pendingProduct, workflowContext)
- Verify agents are routing to the correct next step

### 3. **Understand Complex Workflows**

- Complex workflows involve multiple agent transitions
- Agent routing decisions show the full path
- State is preserved and displayed at each step

### 4. **Expand for Details**

- Click any event to expand
- See structured data in organized sections
- Use "Full JSON" to see raw data

### 5. **Track State Changes**

- See how dealData changes (pending → applied)
- Watch workflowContext updates
- Monitor pendingProduct throughout the flow

## Visual Indicators

### Status Indicators

- **✓** Green checkmark = Active/Applied/Success
- **✗** Gray X = Inactive/Not applied
- **⏳** Yellow hourglass = Pending/Waiting

### Font Styles

- **Monospace** = Technical identifiers (agent names, workflow contexts, deal types)
- **Bold** = Important values (product names)
- **Regular** = Descriptive text

## Filtering & Searching

You can mentally filter events by looking for:

- **Orange cards** (🚦) = Agent routing decisions only
- **Blue cards** (🎯) = Supervisor decisions only
- **Purple cards** (🧠) = Planner recommendations only

## Best Practices

1. **Always expand agent routing decisions** when debugging routing issues
2. **Compare consecutive events** to understand state transitions
3. **Look at Deal Data** to understand deal application logic
4. **Check Workflow Context** to understand current state
5. **Use Full JSON** when you need complete raw data

## Technical Details

### Event Structure

```typescript
{
  id: string;
  timestamp: number;
  type: 'agent_routing_decision';
  data: {
    fromAgent: string;           // Source agent
    toAgent: string;              // Destination (agent name or __end__)
    workflowContext: string;      // Current workflow state
    dealData: {
      applied: boolean;
      pending: boolean;
      type: string;
    } | null;
    pendingProduct: {
      product: string;
      quantity: number;
    } | null;
    cartData: string | null;      // 'present' or detailed object
  };
}
```

### Component Location

- **File**: `/src/components/dev-metadata.tsx`
- **Usage**: Automatically renders in dev tools panel
- **State**: Managed by parent component

## Troubleshooting

### "No routing decision events appearing"

- Check if agents are actually being invoked
- Verify streaming API is sending metadata
- Look for console errors

### "Incomplete data in events"

- Some fields may be null if not applicable
- Check "Full JSON" to see all available data
- Verify agent is properly setting state

### "Events appearing in wrong order"

- Events are ordered by timestamp
- Ensure system clock is accurate
- Check if events are being buffered

## Related Documentation

- **Implementation Details**: `AGENT_ROUTING_DEBUG_METADATA.md`
- **Architecture Overview**: `ARCHITECTURE_OVERVIEW.md`
- **Supervisor Logic**: `SUPERVISOR_ORCHESTRATION_ANALYSIS.md`
- **Dev Metadata**: `DEV_METADATA_VISUAL_GUIDE.md`
