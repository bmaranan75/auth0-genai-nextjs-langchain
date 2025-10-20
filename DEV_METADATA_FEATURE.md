# Dev Metadata Feature Implementation Summary

## Overview
Added a developer metadata panel to the chat interface that displays real-time agent workflow information, including planner recommendations, supervisor routing decisions, and workflow context changes.

## Components Created

### 1. DevMetadata Component (`src/components/dev-metadata.tsx`)
A new React component that displays metadata events in an organized, collapsible format.

**Features:**
- Expandable event cards with color-coded categories
- Timestamp display for each event
- JSON viewer for detailed event data
- Four event types:
  - 🧠 Planner Recommendation (purple)
  - 🎯 Supervisor Decision (blue)
  - 🔄 Agent Transition (green)
  - 📋 Workflow Context (yellow)

**Props:**
```typescript
interface MetadataEvent {
  id: string;
  timestamp: number;
  type: 'planner_recommendation' | 'supervisor_decision' | 'agent_transition' | 'workflow_context';
  data: any;
}

interface DevMetadataProps {
  events: MetadataEvent[];
  className?: string;
}
```

## Updates to Existing Components

### 2. ChatWindow Component (`src/components/chat-window.tsx`)
Added dev metadata tracking and display functionality.

**Changes:**
- Added state for metadata events and panel visibility
- Added "Dev Metadata" toggle button next to "New Chat" button
- Integrated metadata capture from SSE stream
- Added side panel that slides in from right when toggled
- Badge on button shows count of metadata events
- Metadata is cleared when starting a new conversation

**New State:**
```typescript
const [metadataEvents, setMetadataEvents] = useState<MetadataEvent[]>([]);
const [showDevMetadata, setShowDevMetadata] = useState(false);
```

### 3. Chat API Route (`src/app/api/chat/route.ts`)
Enhanced to emit metadata events during streaming.

**Metadata Extraction:**
- Planner recommendations from state chunks
- Supervisor routing decisions (target agent, workflow context)
- Workflow context changes
- Deal/product/cart data presence indicators

**Event Format:**
```typescript
{
  type: 'metadata',
  payload: {
    type: 'planner_recommendation' | 'supervisor_decision' | 'workflow_context',
    data: { /* specific metadata */ },
    timestamp: number
  }
}
```

### 4. Chat Stream API Route (`src/app/api/chat-stream/route.ts`)
Added metadata extraction helper functions.

**New Functions:**
- `extractMetadata(chunk)` - Extracts workflow metadata from stream chunks
- Enhanced to emit `type: 'metadata'` events alongside existing message/status events

## UI Features

### Dev Metadata Button
- Located next to "New Chat" button in header
- Shows count badge when metadata events exist
- Highlighted when panel is open
- Icon: `Code2` (code icon)

### Metadata Panel
- Slides in from right side (384px width)
- Dark mode compatible styling
- Sticky header with title and description
- Scrollable event list
- Smooth transitions and animations

## Usage

### For Developers
1. Start a conversation with the AI assistant
2. Click the "Dev Metadata" button in the header
3. View real-time agent routing decisions and workflow changes
4. Click any event to expand and see full JSON details
5. Use this to debug and understand agent behavior

### Metadata Event Examples

**Planner Recommendation:**
```json
{
  "type": "planner_recommendation",
  "data": {
    "action": "delegate",
    "targetAgent": "catalog",
    "confidence": 0.85,
    "reasoning": "User is asking about product availability"
  }
}
```

**Supervisor Decision:**
```json
{
  "type": "supervisor_decision",
  "data": {
    "targetAgent": "cart_and_checkout",
    "workflowContext": "add_to_cart_with_deals",
    "dealData": "present",
    "pendingProduct": "present"
  }
}
```

**Workflow Context:**
```json
{
  "type": "workflow_context",
  "data": {
    "context": "awaiting_deal_confirmation",
    "dealData": "present",
    "pendingProduct": "present"
  }
}
```

## Benefits

1. **Transparency**: See exactly how the LLM is routing requests between agents
2. **Debugging**: Identify routing issues and workflow problems quickly
3. **Understanding**: Learn how the supervisor evaluates and delegates tasks
4. **Validation**: Verify that workflow context is maintained correctly
5. **Development**: Essential tool for developing and testing agent behaviors

## Technical Details

### Event Flow
```
User Message
    ↓
Agent Processing (stream)
    ↓
Supervisor/Planner decisions
    ↓
Metadata extraction in API
    ↓
SSE event emission (type: 'metadata')
    ↓
ChatWindow captures event
    ↓
DevMetadata displays in panel
```

### Performance
- Metadata events are stored in component state (memory only)
- Events are cleared on new conversation to prevent memory growth
- Minimal overhead - metadata extraction happens during existing stream processing
- Panel is lazily rendered only when visible

## Future Enhancements
- Export metadata to JSON file
- Filter events by type
- Search within metadata
- Timestamp-based playback of decision flow
- Integration with logging/monitoring systems
- Metrics dashboard showing agent usage patterns
