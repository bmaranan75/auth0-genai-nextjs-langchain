# Planner Debugging Guide

## Issue

User asked "What's the weather today?" and got a grocery-related response instead of a direct_response stating the system only handles grocery queries.

## Possible Causes

### 1. **User Message Not Reaching LLM**

- Messages might be malformed or empty
- Extraction logic might be skipping the user's actual message

### 2. **LLM Not Understanding the Prompt**

- Prompt template might have issues
- LLM might be misclassifying the request

### 3. **Response Parsing Issues**

- LLM might be returning correct classification but parsing is failing
- Fallback logic might be kicking in incorrectly

### 4. **Low Confidence Conversion**

- If LLM returns `direct_response` with < 0.7 confidence, it gets converted to `delegate`
- This is intentional but might be too aggressive

## Debugging Steps

### Run the application and check console output:

```bash
npm run dev
```

Then ask: "What's the weather today?"

### Look for these log lines:

```
---PLANNER---
[planner] Received state with X messages
[planner] First message type: ...
[planner] Message contents being sent to LLM:
  [0] HumanMessage: "What's the weather today?"  <-- Verify this shows correct text
[planner] Extracted X valid messages for LLM
[planner] Raw LLM response: ...
[planner] LLM response content: ...              <-- Check what LLM actually returned
[planner] Attempting to parse text: ...
[planner] Extracted JSON text: ...
[planner] Parsed plan: ...                       <-- Check if this shows correct classification
[planner] Final normalized plan: ...             <-- Check if this is still correct
```

## Expected vs Actual Behavior

### Expected for "What's the weather today?":

```json
{
  "action": "direct_response",
  "confidence": 0.95,
  "reasoning": "unrelated to grocery shopping",
  "task": "I can only help with grocery shopping. What would you like to add to your cart?"
}
```

### If you see `action: "delegate"` instead:

**Check these scenarios:**

1. **LLM returned delegate directly**
   - Look at `[planner] Parsed plan:` - if it shows `"action": "delegate"`, the LLM misclassified
   - Issue: Prompt needs improvement or LLM model issue

2. **LLM returned direct_response but got converted**
   - Look for: `[planner] Low confidence (...) for direct_response, converting to delegate for safety`
   - Issue: Confidence threshold (0.7) might be too high
   - Solution: Lower threshold or improve prompt to increase confidence

3. **Parsing failed**
   - Look for: `[planner] Failed to parse plan JSON`
   - Issue: LLM returned malformed JSON
   - Check: `[planner] LLM response content:` to see raw output

4. **User message not sent**
   - Check: `[planner] Message contents being sent to LLM:`
   - If this shows wrong/empty message, extraction logic has a bug

## Quick Fixes

### If LLM is misclassifying:

The prompt might need adjustment. The current prompt should correctly identify weather as off-topic.

### If confidence is too low:

Adjust the threshold in `validateAndNormalizePlan`:

```typescript
// Change from 0.7 to 0.6 or lower
if (normalizedPlan.confidence < 0.6 && normalizedPlan.action === 'direct_response') {
```

### If messages aren't reaching LLM:

Check the message extraction logic - might need to handle a new message format.

### If parsing is failing:

Check if LLM is wrapping JSON in markdown code blocks or adding explanatory text.

## Test Cases

After fixing, test with:

1. ✅ "What's the weather today?" → should be `direct_response`
2. ✅ "Tell me a joke" → should be `direct_response`
3. ✅ "What's the capital of France?" → should be `direct_response`
4. ✅ "Find organic apples" → should be `delegate`
5. ✅ "Add milk to my cart" → should be `delegate`
6. ✅ "Hello" → should be `delegate` (greeting in shopping context)

## Share Console Output

When reporting the issue, please share:

1. The full console output starting from `---PLANNER---`
2. The user's input message
3. The final response received by the user
4. Any error messages

This will help identify exactly where the issue is occurring.
