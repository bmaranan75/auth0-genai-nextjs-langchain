# Dev Metadata Planner Enhancement

## Overview

Enhanced the Dev Metadata panel to provide a more detailed and user-friendly view of planner recommendations, making it easier to understand the routing decisions made by the planner agent.

## Changes Made

### Component: `src/components/dev-metadata.tsx`

#### 1. **Improved Preview Display**

- Added special handling for planner recommendations in the collapsed view
- Now shows both `targetAgent` and `recommendedAgent` fields (for backward compatibility)
- Displays action, target agent, and confidence percentage in the preview

#### 2. **Enhanced Expanded View for Planner Recommendations**

When a planner recommendation event is expanded, it now shows:

- **Action**: The recommended action (`direct_response` or `delegate`)
- **Target Agent**: The recommended agent to handle the request
- **Confidence**: The planner's confidence level (0-100%)
- **Reasoning**: The planner's explanation for the recommendation
- **Task**: The task description (if available)
- **Full JSON**: A collapsible section with the complete raw data

#### 3. **Structured Layout**

- Grid layout for key metrics (Action, Target Agent, Confidence)
- Dedicated sections for reasoning and task information
- Clean, readable formatting with proper spacing
- Collapsible "Full JSON" section for developers who need raw data

## Visual Improvements

### Before

```
🧠 Planner Recommendation  10:23:45.123
Action: delegate → supervisor (50%)
[Raw JSON blob when expanded]
```

### After

**Collapsed:**

```
🧠 Planner Recommendation  10:23:45.123
Action: delegate → supervisor (85%)
```

**Expanded:**

```
┌─────────────────────────────────────────┐
│ Action:           │ Target Agent:       │
│ delegate          │ supervisor          │
├─────────────────────────────────────────┤
│ Confidence:       │                     │
│ 85%              │                     │
├─────────────────────────────────────────┤
│ Reasoning:                              │
│ Complex workflow requiring multi-agent  │
│ coordination for deals + cart           │
├─────────────────────────────────────────┤
│ Task:                                   │
│ Check for banana deals and add to cart │
├─────────────────────────────────────────┤
│ ▶ Full JSON                            │
└─────────────────────────────────────────┘
```

## Benefits

1. **Easier Route Plan Visibility**: Developers can quickly see what the planner recommended
2. **Better Understanding**: Reasoning field explains why the planner made its decision
3. **Quick Metrics**: Confidence level helps assess the planner's certainty
4. **Flexible Detail**: Collapsed view for quick scanning, expanded view for deep inspection
5. **Raw Data Access**: Full JSON still available for debugging when needed

## Use Cases

### 1. **Debugging Routing Issues**

- Quickly see if the planner is recommending the right agent
- Check confidence levels to identify uncertain decisions
- Review reasoning to understand the decision logic

### 2. **Testing Planner Prompts**

- Verify that planner prompt changes affect recommendations as expected
- Compare confidence levels across different user queries
- Validate that reasoning aligns with intended behavior

### 3. **Understanding Workflow Decisions**

- See why complex queries are routed to supervisor
- Understand when planner chooses direct response vs delegation
- Track the flow from planner → supervisor → specialized agents

## Example Scenarios

### Scenario 1: Deal + Cart Query

```
User: "Check if there are deals for apples and add them to cart"

Planner Recommendation:
- Action: delegate
- Target Agent: supervisor
- Confidence: 95%
- Reasoning: "Complex workflow requiring deals check + conditional cart addition"
```

### Scenario 2: Simple Greeting

```
User: "Hello"

Planner Recommendation:
- Action: direct_response
- Confidence: 98%
- Reasoning: "Simple greeting that doesn't require specialized agent"
```

### Scenario 3: Deal Search

```
User: "What deals are available on milk?"

Planner Recommendation:
- Action: delegate
- Target Agent: deals
- Confidence: 92%
- Reasoning: "Specific deal inquiry for deals agent"
```

## Technical Notes

- Maintains backward compatibility with both `targetAgent` and `recommendedAgent` fields
- Gracefully handles missing fields (shows only available data)
- Non-planner events still show raw JSON in expanded view
- No breaking changes to the `MetadataEvent` interface

## Future Enhancements

Potential improvements for future iterations:

1. Add visual confidence indicator (progress bar or color coding)
2. Show planner decision history/trends
3. Add ability to "replay" planner decisions with different prompts
4. Link planner recommendations to actual supervisor decisions for comparison
