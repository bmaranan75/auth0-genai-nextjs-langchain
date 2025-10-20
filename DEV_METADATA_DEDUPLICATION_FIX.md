# Dev Metadata Deduplication Fix

## Problem

When testing the dev metadata feature with a complex workflow like:
```
"Can you please add 8 apples to my cart and if there are any available deals, please take it as well"
```

The workflow context `add_to_cart_with_deals` was appearing **3 times** in the dev metadata panel, even though the context hadn't actually changed.

## Root Cause

The issue was in the metadata extraction logic in both API routes:
- `src/app/api/chat/route.ts`
- `src/app/api/chat-stream/route.ts`

### Before Fix

The code was emitting a `workflow_context` metadata event **every time** it encountered a `workflowContext` field in a stream chunk, regardless of whether the context had actually changed:

```typescript
// ❌ BEFORE: Emits every time workflowContext is present
if ((nodeOutput as any).workflowContext) {
  sendSSE({
    type: 'metadata',
    payload: {
      type: 'workflow_context',
      data: {
        context: (nodeOutput as any).workflowContext,
        // ...
      }
    }
  });
}
```

### Why Multiple Events?

In a complex workflow, the state is passed through multiple nodes:

1. **Supervisor sets context** → `add_to_cart_with_deals` → **Event #1** ✅
2. **Deals agent** receives state with same context → **Event #2** ❌ (duplicate)
3. **Supervisor routes again** with same context → **Event #3** ❌ (duplicate)
4. **Cart agent** receives state with same context → **Event #4** ❌ (duplicate)

Each node in the graph receives the full state, including the `workflowContext`, so the old code was emitting the same context multiple times.

## Solution

Track the previous workflow context and only emit metadata events when it **actually changes**.

### `/api/chat/route.ts` Fix

```typescript
// Track workflow context to only emit metadata when it changes
let previousWorkflowContext: string | null = null;

// Inside the stream processing loop:
const currentWorkflowContext = (nodeOutput as any).workflowContext;
if (currentWorkflowContext && currentWorkflowContext !== previousWorkflowContext) {
  sendSSE({
    type: 'metadata',
    payload: {
      type: 'workflow_context',
      data: {
        context: currentWorkflowContext,
        dealData: (nodeOutput as any).dealData ? 'present' : null,
        pendingProduct: (nodeOutput as any).pendingProduct ? 'present' : null
      },
      timestamp: Date.now()
    }
  });
  previousWorkflowContext = currentWorkflowContext;
  console.log(`[chat-api] Workflow context changed to: ${currentWorkflowContext}`);
}
```

### `/api/chat-stream/route.ts` Fix

Updated the `extractMetadata` function to:
1. Accept the previous context as a parameter
2. Return both the metadata (if changed) and the new context
3. Only emit metadata when context actually changes

```typescript
// Track workflow context
let previousWorkflowContext: string | null = null;

// Updated function signature
function extractMetadata(chunk: any, prevContext: string | null): 
  { metadata: any | null, newContext: string | null } {
  // ...
  
  // Check for workflow context changes - ONLY emit if it changed
  if (chunk.workflowContext && chunk.workflowContext !== prevContext) {
    newContext = chunk.workflowContext;
    return {
      metadata: {
        type: 'workflow_context',
        data: {
          context: chunk.workflowContext,
          dealData: chunk.dealData ? 'present' : null,
          pendingProduct: chunk.pendingProduct ? 'present' : null
        },
        timestamp: Date.now()
      },
      newContext
    };
  }
  
  return { metadata: null, newContext: prevContext };
}

// Usage in stream loop
const { metadata, newContext } = extractMetadata(chunk, previousWorkflowContext);
if (metadata) {
  controller.enqueue(encoder.encode(JSON.stringify({ 
    type: 'metadata', 
    payload: metadata 
  }) + '\n'));
}
previousWorkflowContext = newContext;
```

## After Fix

Now the workflow context only appears **once** when it's initially set:

```
Complex Workflow: "add 8 apples and take any deals"
  ↓
1. Supervisor sets context: check_deals (Event #1) ✅
  ↓
2. Deals agent processes (no duplicate event) ✓
  ↓
3. Supervisor changes context: add_to_cart_with_deals (Event #2) ✅
  ↓
4. Cart agent processes (no duplicate event) ✓
  ↓
Result: 2 unique workflow context events instead of 4+
```

## Benefits

1. **Cleaner Metadata Timeline**: Only shows actual state transitions
2. **Easier Debugging**: No need to filter through duplicate events
3. **Accurate Representation**: Reflects the actual workflow state changes
4. **Better Performance**: Fewer events sent over the wire

## Testing

To verify the fix works:

1. Start the application
2. Open the dev metadata panel
3. Send a complex workflow message:
   ```
   "Can you please add 8 apples to my cart and if there are any available deals, please take it as well"
   ```
4. Observe the workflow context events - should now see:
   - Initial context: `check_deals`
   - Context change: `add_to_cart_with_deals`
   - No duplicates

## Files Modified

- ✅ `src/app/api/chat/route.ts` - Added context tracking and change detection
- ✅ `src/app/api/chat-stream/route.ts` - Updated extractMetadata function with context tracking

## Implementation Pattern

This same pattern can be applied to other metadata types if needed:

```typescript
// Generic deduplication pattern
let previousValue: T | null = null;

if (currentValue && currentValue !== previousValue) {
  emitEvent(currentValue);
  previousValue = currentValue;
}
```

This ensures we only emit events when there's an actual change, not just when the value is present in the stream.
