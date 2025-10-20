# Planner Direct Response Routing Fix

## Issue

When planner correctly classified off-topic questions (like "What's the weather?") as `direct_response`, the system was still routing to the supervisor instead of returning the response directly to the user.

### Example:

**User:** "What's the weather today?"

**Planner correctly returned:**

```json
{
  "action": "direct_response",
  "task": "I can only help with grocery shopping. What would you like to add to your cart?",
  "confidence": 0.95,
  "reasoning": "unrelated to grocery"
}
```

**But:** System still routed to supervisor → supervisor delegated to an agent → user got grocery-related response

## Root Cause

The `routePlanner` function in `supervisor.ts` was **ALWAYS** routing to the supervisor regardless of the planner's recommendation action:

```typescript
// OLD CODE (INCORRECT)
if (
  lastMessage &&
  (lastMessage.planningRecommendation || lastMessage.delegation)
) {
  const recommendation =
    lastMessage.planningRecommendation || lastMessage.delegation;

  // Store recommendation and ALWAYS route to supervisor
  (state as any).plannerRecommendation = recommendation;

  // ❌ PROBLEM: This ignores the action type!
  return 'supervisor'; // <-- Always supervisor, even for direct_response
}
```

The comment even said "ALWAYS route to supervisor" - this was a misunderstanding of the planner → supervisor architecture.

## Solution

Updated `routePlanner` to respect the planner's action recommendation:

```typescript
// NEW CODE (CORRECT)
if (
  lastMessage &&
  (lastMessage.planningRecommendation || lastMessage.delegation)
) {
  const recommendation =
    lastMessage.planningRecommendation || lastMessage.delegation;

  console.log(
    `[routePlanner] Received planner recommendation:`,
    recommendation,
  );

  // ✅ Handle direct_response: Return immediately
  if (recommendation.action === 'direct_response') {
    console.log(
      '[routePlanner] Direct response action - ending workflow immediately',
    );

    // Update message content with the response
    if (lastMessage.message && recommendation.task) {
      lastMessage.message.content = recommendation.task;
    }

    return END; // <-- End workflow, return to user
  }

  // ✅ Handle delegate: Route to supervisor
  if (recommendation.action === 'delegate') {
    console.log('[routePlanner] Delegate action - routing to supervisor');
    (state as any).plannerRecommendation = recommendation;
    return 'supervisor'; // <-- Only route to supervisor for delegation
  }

  // Unknown action - default to supervisor for safety
  return 'supervisor';
}
```

## Architecture Clarification

### Planner → Supervisor Pattern (CORRECT)

```
User Message
    ↓
  PLANNER (Binary Classifier)
    ↓
    ├─ action="direct_response" → END (return to user)
    │  ↓
    │  User receives: planner's task message
    │
    └─ action="delegate" → SUPERVISOR
       ↓
       SUPERVISOR (Agent Router)
       ↓
       Delegates to: catalog | cart | deals | payment
       ↓
       Agent executes task
       ↓
       Returns to user
```

### Key Points:

1. **Planner's Role:**
   - Binary classifier: "Is this grocery-related?"
   - Does NOT route to specific agents
   - Only decides: `delegate` or `direct_response`

2. **Supervisor's Role:**
   - Only involved for grocery-related requests (`delegate`)
   - Routes to specific agents (catalog, cart, deals, etc.)
   - Handles complex workflows

3. **Direct Response Flow:**
   - Planner handles off-topic questions directly
   - No supervisor/agent involvement needed
   - Faster response, less overhead

## Testing

### Test Case 1: Off-topic Question (Direct Response)

```
User: "What's the weather today?"

Expected Flow:
  User → Planner → END

Expected Response:
  "I can only help with grocery shopping. What would you like to add to your cart?"

Console Log:
  [routePlanner] Received planner recommendation: { action: 'direct_response', ... }
  [routePlanner] Direct response action - ending workflow immediately
  [routePlanner] Response: I can only help with grocery shopping...
```

### Test Case 2: Grocery Question (Delegation)

```
User: "Find organic apples"

Expected Flow:
  User → Planner → Supervisor → Catalog Agent → User

Expected Response:
  [Product search results for organic apples]

Console Log:
  [routePlanner] Received planner recommendation: { action: 'delegate', ... }
  [routePlanner] Delegate action - routing to supervisor
  [supervisor] Processing planner recommendation...
```

### Test Case 3: Greeting (Delegation)

```
User: "Hello"

Expected Flow:
  User → Planner → Supervisor → [Contextual greeting] → User

Expected Response:
  "Hello! Welcome to our grocery service. [contextual info]"

Console Log:
  [routePlanner] Received planner recommendation: { action: 'delegate', ... }
  [routePlanner] Delegate action - routing to supervisor
```

## Verification

Run these test cases:

1. ✅ **Off-topic:** "What's the weather?" → Should get "I can only help with grocery shopping..."
2. ✅ **Off-topic:** "Tell me a joke" → Should get grocery-focused redirect
3. ✅ **Off-topic:** "What's the capital of France?" → Should get grocery-focused redirect
4. ✅ **Grocery:** "Find apples" → Should get product results
5. ✅ **Grocery:** "Add milk to cart" → Should add to cart
6. ✅ **Greeting:** "Hello" → Should get personalized greeting (via supervisor)

## Files Changed

- ✅ `/src/lib/agents/supervisor.ts` - Fixed `routePlanner` function to respect planner actions

## Benefits

1. **Correct Behavior:** Off-topic questions now handled properly
2. **Better Performance:** Direct responses skip supervisor/agent overhead
3. **Clearer Architecture:** Separation of concerns maintained
4. **Faster Responses:** Off-topic queries return immediately

## Before vs After

### Before (Broken):

- "What's the weather?" → Planner → Supervisor → Agent → Grocery response ❌

### After (Fixed):

- "What's the weather?" → Planner → Direct response ✅
- "Find apples" → Planner → Supervisor → Agent → Results ✅

## Related Documentation

- `PLANNER_OPTIMIZATION.md` - Planner prompt optimization
- `PLANNER_ERROR_FIX.md` - Message extraction fixes
- `PLANNER_DEBUG_GUIDE.md` - Debugging guide
