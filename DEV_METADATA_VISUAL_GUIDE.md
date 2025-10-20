# Dev Metadata Feature - Visual Guide

## UI Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Header                                                                  │
│  ┌──────────────────────────┐  ┌──────────────────────────┐            │
│  │ 🔧 Dev Metadata [5]     │  │ ➕ New Chat              │            │
│  └──────────────────────────┘  └──────────────────────────┘            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                │                         │
│  Chat Messages Area                            │  Dev Metadata Panel     │
│                                                │  (slides in/out)        │
│  ┌──────────────────────────────────┐          │                         │
│  │ 🛒 Assistant Message             │          │  Agent Workflow Metadata│
│  │ Hello! How can I help?           │          │  ─────────────────────  │
│  └──────────────────────────────────┘          │                         │
│                                                │  🧠 Planner Recommend..  │
│  ┌──────────────────────────────────┐          │  ▶ Action: delegate     │
│  │                     User Message  │          │    12:34:56.789        │
│  │     Find me some apples          │          │                         │
│  └──────────────────────────────────┘          │  🎯 Supervisor Decision │
│                                                │  ▼ Target: catalog      │
│  ┌──────────────────────────────────┐          │    {                    │
│  │ 🛒 Assistant Message             │          │      "targetAgent": ... │
│  │ I found organic apples...        │          │    }                    │
│  └──────────────────────────────────┘          │                         │
│                                                │  📋 Workflow Context    │
│                                                │  ▶ Context: check_deals │
│  ┌──────────────────────────────────┐          │    12:34:57.123        │
│  │ Status: 🛍️ Searching catalog...  │          │                         │
│  └──────────────────────────────────┘          │                         │
│                                                │                         │
│  ┌──────────────────────────────────┐          │                         │
│  │  Type your message...      [→]  │          │                         │
│  └──────────────────────────────────┘          │                         │
│                                                │                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Event Card Expanded View

```
┌───────────────────────────────────────────────┐
│ 🧠 Planner Recommendation    12:34:56.789  ▼ │
├───────────────────────────────────────────────┤
│ {                                             │
│   "action": "delegate",                       │
│   "targetAgent": "catalog",                   │
│   "confidence": 0.85,                         │
│   "reasoning": "User is asking about          │
│                 product availability"         │
│ }                                             │
└───────────────────────────────────────────────┘
```

## Color Coding

| Event Type              | Color  | Icon | Purpose                           |
|------------------------|--------|------|-----------------------------------|
| Planner Recommendation | Purple | 🧠   | Shows AI planning decisions       |
| Supervisor Decision    | Blue   | 🎯   | Shows agent routing choices       |
| Agent Transition       | Green  | 🔄   | Shows agent handoffs              |
| Workflow Context       | Yellow | 📋   | Shows workflow state changes      |

## Example Workflow Trace

```
User: "Check for deals on apples and add 5 to cart if available"

┌─────────────────────────────────────────────────────────────┐
│ 🧠 Planner Recommendation                    12:00:00.100  │
│ ▼ Action: delegate → deals                                  │
│   Confidence: 0.92                                          │
│   Reasoning: "Complex workflow with deals check"            │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 🎯 Supervisor Decision                       12:00:00.150  │
│ ▼ Target: deals                                             │
│   Context: check_deals                                      │
│   Pending Product: present                                  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 🔄 Agent Transition                          12:00:01.200  │
│ ▶ Agent: deals                                              │
│   Timestamp: 1729123456200                                  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 📋 Workflow Context                          12:00:01.250  │
│ ▼ Context: awaiting_deal_confirmation                       │
│   Deal Data: present                                        │
│   Pending Product: present                                  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 🎯 Supervisor Decision                       12:00:02.100  │
│ ▼ Target: cart_and_checkout                                 │
│   Context: add_to_cart_with_deals                           │
│   Deal Data: present                                        │
└─────────────────────────────────────────────────────────────┘
```

## Interaction Flow

```
┌─────────┐     ┌──────────┐     ┌───────────┐     ┌──────────────┐
│  User   │────▶│  Planner │────▶│Supervisor │────▶│ Target Agent │
└─────────┘     └──────────┘     └───────────┘     └──────────────┘
     │               │                  │                   │
     │               ▼                  ▼                   ▼
     │          Metadata           Metadata            Metadata
     │          Event 1            Event 2             Event 3
     │               │                  │                   │
     │               └──────────────────┴───────────────────┘
     │                                  │
     │                                  ▼
     │                        ┌─────────────────────┐
     │                        │  DevMetadata Panel  │
     │                        │  - Event Timeline   │
     │                        │  - JSON Viewer      │
     │                        │  - Type Filters     │
     │                        └─────────────────────┘
     │                                  │
     └──────────────────────────────────┘
              Developer observes workflow
```

## Button States

### Closed (No Events)
```
┌──────────────────────┐
│ 🔧 Dev Metadata     │
└──────────────────────┘
```

### Closed (With Events)
```
┌──────────────────────┐
│ 🔧 Dev Metadata [5]  │  ← Badge shows count
└──────────────────────┘
```

### Open
```
┌──────────────────────┐
│ 🔧 Dev Metadata [5]  │  ← Highlighted background
└──────────────────────┘
```

## Panel Animation

```
Closed:  [Chat Area ──────────────────────────] |
                                                 ↑ Panel hidden (width: 0)

Opening: [Chat Area ───────────────────] [Panel─]
                                          ↑ Slides in (300ms transition)

Open:    [Chat Area ──────────────] [Panel Panel]
                                     ↑ Full width (384px)
```

## Developer Experience

### Before Dev Metadata
❌ No visibility into agent decisions
❌ Hard to debug routing issues
❌ Can't see workflow state changes
❌ Must read logs to understand flow

### After Dev Metadata
✅ Real-time visibility of all decisions
✅ Easy debugging with expandable JSON
✅ Clear workflow state tracking
✅ Visual timeline of agent handoffs
✅ No need to check server logs
