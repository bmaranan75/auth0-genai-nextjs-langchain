# Planner Route Plan Display - Visual Guide

## Overview

This document shows how the enhanced Dev Metadata panel displays planner recommendations with improved formatting.

## Display Example

### 1. Collapsed View (Quick Preview)

```
┌─────────────────────────────────────────────────────────┐
│ 🧠 Planner Recommendation         14:23:45.123         │
│ Action: delegate → supervisor (95%)                     │
└─────────────────────────────────────────────────────────┘
```

### 2. Expanded View (Full Details)

#### Example A: Complex Workflow Query

**User Query**: "Check if there are deals for apples and add them to cart"

```
┌────────────────────────────────────────────────────────────────┐
│ 🧠 Planner Recommendation                    14:23:45.123     │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────┬──────────────────────┐             │
│  │ Action:              │ Target Agent:        │             │
│  │ ┌──────────────────┐ │ ┌──────────────────┐ │             │
│  │ │ delegate         │ │ │ supervisor       │ │             │
│  │ └──────────────────┘ │ └──────────────────┘ │             │
│  └──────────────────────┴──────────────────────┘             │
│                                                                │
│  ┌──────────────────────┐                                     │
│  │ Confidence:          │                                     │
│  │ ┌──────────────────┐ │                                     │
│  │ │ 95%              │ │                                     │
│  │ └──────────────────┘ │                                     │
│  └──────────────────────┘                                     │
│                                                                │
│  Reasoning:                                                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Complex workflow requiring multi-agent coordination  │    │
│  │ for deals check + conditional cart addition          │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                                │
│  Task:                                                         │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Check if there are deals for apples and if there    │    │
│  │ is, add few to my cart                               │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                                │
│  ▶ Full JSON                                                  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

#### Example B: Deal Search Query

**User Query**: "What deals are available on milk?"

```
┌────────────────────────────────────────────────────────────────┐
│ 🧠 Planner Recommendation                    14:25:12.456     │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────┬──────────────────────┐             │
│  │ Action:              │ Target Agent:        │             │
│  │ ┌──────────────────┐ │ ┌──────────────────┐ │             │
│  │ │ delegate         │ │ │ deals            │ │             │
│  │ └──────────────────┘ │ └──────────────────┘ │             │
│  └──────────────────────┴──────────────────────┘             │
│                                                                │
│  ┌──────────────────────┐                                     │
│  │ Confidence:          │                                     │
│  │ ┌──────────────────┐ │                                     │
│  │ │ 92%              │ │                                     │
│  │ └──────────────────┘ │                                     │
│  └──────────────────────┘                                     │
│                                                                │
│  Reasoning:                                                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Specific deal inquiry best handled by deals agent    │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                                │
│  ▶ Full JSON                                                  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

#### Example C: Simple Greeting

**User Query**: "Hello"

```
┌────────────────────────────────────────────────────────────────┐
│ 🧠 Planner Recommendation                    14:26:33.789     │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────┐                                     │
│  │ Action:              │                                     │
│  │ ┌──────────────────┐ │                                     │
│  │ │ direct_response  │ │                                     │
│  │ └──────────────────┘ │                                     │
│  └──────────────────────┘                                     │
│                                                                │
│  ┌──────────────────────┐                                     │
│  │ Confidence:          │                                     │
│  │ ┌──────────────────┐ │                                     │
│  │ │ 98%              │ │                                     │
│  │ └──────────────────┘ │                                     │
│  └──────────────────────┘                                     │
│                                                                │
│  Reasoning:                                                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Simple greeting that doesn't require specialized     │    │
│  │ agent handling                                        │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                                │
│  ▶ Full JSON                                                  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## Key Information Displayed

### Always Visible (when expanded)

1. **Action**: The planner's recommended action
   - `delegate` - Route to a specialized agent
   - `direct_response` - Handle directly without agent

2. **Confidence**: Planner's confidence level (0-100%)
   - Higher confidence = more certain about the decision
   - Lower confidence = may need supervisor review

### Conditionally Visible (when present in data)

3. **Target Agent**: Which agent should handle the request
   - Only shown for `delegate` actions
   - Examples: supervisor, deals, catalog, cart_and_checkout

4. **Reasoning**: Explanation of why the planner made this decision
   - Provides context for the recommendation
   - Helps debug routing issues

5. **Task**: The interpreted task from the user query
   - Shows how the planner understood the request
   - Useful for validating intent recognition

6. **Full JSON**: Complete raw data (collapsible)
   - Available for debugging
   - Contains all metadata fields

## Color Coding

The planner recommendations use a **purple** color scheme:

- Light mode: Light purple background
- Dark mode: Dark purple background
- Purple border in both modes

## Icons

- 🧠 = Planner Recommendation
- 🎯 = Supervisor Decision
- 🔄 = Agent Transition
- 📋 = Workflow Context

## Interactive Features

1. **Click to Expand/Collapse**: Click anywhere on the event card
2. **Full JSON Toggle**: Click "Full JSON" to show/hide raw data
3. **Hover Effects**: Cards slightly fade on hover for better interaction feedback

## Confidence Interpretation Guide

| Confidence | Interpretation | Action                   |
| ---------- | -------------- | ------------------------ |
| 90-100%    | Very confident | Strong recommendation    |
| 70-89%     | Confident      | Good recommendation      |
| 50-69%     | Moderate       | May need review          |
| 30-49%     | Low confidence | Supervisor should decide |
| 0-29%      | Very uncertain | Default to supervisor    |

## Use Cases

### Debugging Routes

1. Open Dev Metadata panel (click 🔍 button)
2. Find the planner recommendation event
3. Check the Target Agent and Confidence
4. Review the Reasoning to understand the decision

### Testing Planner Changes

1. Modify planner prompt
2. Send test query
3. Expand planner recommendation
4. Verify action, target agent, and reasoning match expectations

### Understanding Complex Workflows

1. Send multi-step query
2. Observe planner recommends supervisor
3. Check reasoning explains multi-agent coordination
4. Follow subsequent supervisor decisions in metadata

## Mobile/Small Screen Behavior

On smaller screens, the 2-column grid (Action + Target Agent) may stack vertically for better readability while maintaining all information.
