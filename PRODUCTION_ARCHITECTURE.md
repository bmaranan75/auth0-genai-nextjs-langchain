# Production Architecture with LangGraph Deployment

## Complete System Architecture

### Full Stack Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        External Clients                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   Claude     │  │   ChatGPT    │  │   Cursor     │              │
│  │   Desktop    │  │  Enterprise  │  │     IDE      │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
└─────────┼──────────────────┼──────────────────┼──────────────────────┘
          │                  │                  │
          │ HTTPS/SSE        │ HTTPS/SSE        │ HTTPS/SSE
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼──────────────────────┐
│                      WAF + DDoS Protection                            │
│  - IP Whitelist (ChatGPT Enterprise ranges)                          │
│  - Rate Limiting (1000 req/min per IP)                               │
│  - TLS 1.3 enforcement                                                │
│  - Request size limits                                                │
└─────────────────────────────┬─────────────────────────────────────────┘
                              │
┌─────────────────────────────▼─────────────────────────────────────────┐
│                    Load Balancer / Ingress                            │
│  - SSL/TLS Termination                                                │
│  - Health checks: /health                                             │
│  - Session affinity (for SSE)                                         │
│  - Certificate management                                             │
└─────────────────────────────┬─────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
┌─────────▼──────────┐ ┌──────▼────────┐ ┌───────▼────────┐
│   MCP Server       │ │  MCP Server   │ │  MCP Server    │
│   Pod 1            │ │  Pod 2        │ │  Pod 3         │
│  (port 3001)       │ │  (port 3001)  │ │  (port 3001)   │
│                    │ │               │ │                │
│  - SSE Transport   │ │  - SSE Transport│ │  - SSE Transport│
│  - Stateless       │ │  - Stateless  │ │  - Stateless   │
│  - Health: /health │ │  - Health: /health│ │  - Health: /health│
│  - API Key Auth    │ │  - API Key Auth│ │  - API Key Auth│
└─────────┬──────────┘ └──────┬────────┘ └───────┬────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │ HTTP + MCP_API_KEY
┌─────────────────────────────▼─────────────────────────────────────────┐
│                    Next.js Application Load Balancer                  │
│  - Internal service mesh                                              │
│  - Health checks                                                      │
└─────────────────────────────┬─────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
┌─────────▼──────────┐ ┌──────▼────────┐ ┌───────▼────────┐
│   Next.js API      │ │  Next.js API  │ │  Next.js API   │
│   Pod 1            │ │  Pod 2        │ │  Pod 3         │
│  (port 3000)       │ │  (port 3000)  │ │  (port 3000)   │
│                    │ │               │ │                │
│  Routes:           │ │  Routes:      │ │  Routes:       │
│  /api/mcp/agents/* │ │  /api/chat    │ │  /api/checkout │
│  /api/chat         │ │  /api/mcp/*   │ │  /api/payment  │
│  /api/checkout     │ │               │ │                │
│                    │ │               │ │                │
│  Middleware:       │ │  Middleware:  │ │  Middleware:   │
│  - MCP auth bypass │ │  - Auth0      │ │  - Auth0       │
│  - Auth0 for users │ │               │ │                │
└─────────┬──────────┘ └──────┬────────┘ └───────┬────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │ LangGraph SDK (HTTP)
┌─────────────────────────────▼─────────────────────────────────────────┐
│                    LangGraph Cloud / LangGraph Server                 │
│                    (Deployed separately)                              │
│                                                                        │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │              LangGraph Supervisor                             │   │
│  │  - Orchestrates multi-agent workflow                          │   │
│  │  - State management via checkpointer                          │   │
│  │  - Thread-based conversation tracking                         │   │
│  └────────┬──────────────┬──────────────┬──────────────┬─────────┘   │
│           │              │              │              │              │
│  ┌────────▼────────┐ ┌───▼──────────┐ ┌▼─────────────┐ ┌▼──────────┐│
│  │ Catalog Agent   │ │ Cart & Checkout│ │ Payment Agent│ │Deals Agent││
│  │                 │ │     Agent     │ │              │ │           ││
│  │ - Search        │ │ - Add to cart │ │ - Add payment│ │- Get deals││
│  │   products      │ │ - View cart   │ │   method     │ │- Promos   ││
│  │ - Browse        │ │ - Checkout    │ │ - Process    │ │- Offers   ││
│  │   catalog       │ │ - Cart mgmt   │ │   payment    │ │           ││
│  └────────┬────────┘ └───┬──────────┘ └──┬───────────┘ └┬──────────┘│
│           │              │                │              │            │
└───────────┼──────────────┼────────────────┼──────────────┼────────────┘
            │              │                │              │
            └──────────────┼────────────────┼──────────────┘
                           │ LangChain/LangGraph Runtime
┌──────────────────────────▼────────────────────────────────────────────┐
│                      External Services & Data                         │
│                                                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   Auth0     │  │  Safeway    │  │  OpenAI     │  │  LangSmith  │ │
│  │   (CIBA)    │  │    API      │  │    API      │  │  (Tracing)  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │
│                                                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │ PostgreSQL  │  │  Redis      │  │   S3/Blob   │                  │
│  │ (State DB)  │  │  (Cache)    │  │  (Storage)  │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
└───────────────────────────────────────────────────────────────────────┘
```

## Deployment Models

### Option 1: LangGraph Cloud (Fully Managed)

```
┌─────────────────────────────────────────────────┐
│          Your Kubernetes Cluster                │
│                                                 │
│  ┌────────────────┐      ┌─────────────────┐  │
│  │  MCP Server    │      │  Next.js App    │  │
│  │  Pods (3x)     │─────▶│  Pods (3x)      │  │
│  └────────────────┘      └────────┬────────┘  │
│                                    │            │
└────────────────────────────────────┼────────────┘
                                     │
                          LangGraph SDK (HTTPS)
                                     │
┌────────────────────────────────────▼────────────┐
│         LangGraph Cloud (Managed by LangChain)  │
│                                                  │
│  - Automatic scaling                            │
│  - Built-in checkpointer                        │
│  - Monitoring & tracing                         │
│  - Managed infrastructure                       │
│  - Pay-as-you-go                                │
│                                                  │
│  URL: https://your-deployment.langchain.com     │
│  API Key: LANGCHAIN_API_KEY                     │
└─────────────────────────────────────────────────┘
```

**Configuration:**
```typescript
// In Next.js API routes
import { Client } from "@langchain/langgraph-sdk";

const client = new Client({
  apiUrl: process.env.LANGGRAPH_API_URL, // LangGraph Cloud URL
  apiKey: process.env.LANGCHAIN_API_KEY,
});

// Call agents
const thread = await client.threads.create();
await client.runs.create(thread.thread_id, "catalog_graph", {
  input: { query: "milk" }
});
```

### Option 2: Self-Hosted LangGraph Server

```
┌────────────────────────────────────────────────────────────┐
│               Your Kubernetes Cluster                      │
│                                                            │
│  ┌────────────┐    ┌────────────┐    ┌─────────────────┐ │
│  │ MCP Server │───▶│ Next.js    │───▶│ LangGraph Server│ │
│  │ Pods (3x)  │    │ Pods (3x)  │    │ Pods (2x)       │ │
│  └────────────┘    └────────────┘    │                 │ │
│                                       │ - Graph runtime │ │
│                                       │ - State mgmt    │ │
│                                       │ - Agent exec    │ │
│                                       └────────┬────────┘ │
│                                                │          │
│  ┌─────────────────────────────────────────────▼────────┐ │
│  │            Shared Services                           │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │ │
│  │  │PostgreSQL│  │  Redis   │  │ OpenAI   │          │ │
│  │  │(State DB)│  │ (Cache)  │  │   API    │          │ │
│  │  └──────────┘  └──────────┘  └──────────┘          │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

**Kubernetes Manifests:**
```yaml
# k8s/langgraph-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: langgraph-server
  namespace: shopping-assistant
spec:
  replicas: 2
  selector:
    matchLabels:
      app: langgraph-server
  template:
    metadata:
      labels:
        app: langgraph-server
    spec:
      containers:
      - name: langgraph-server
        image: your-registry/langgraph-server:latest
        ports:
        - containerPort: 8000
          name: http
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: connection-string
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: openai-secret
              key: api-key
        - name: LANGCHAIN_TRACING_V2
          value: "true"
        - name: LANGCHAIN_API_KEY
          valueFrom:
            secretKeyRef:
              name: langsmith-secret
              key: api-key
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 5
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
---
apiVersion: v1
kind: Service
metadata:
  name: langgraph-service
  namespace: shopping-assistant
spec:
  type: ClusterIP
  selector:
    app: langgraph-server
  ports:
  - port: 8000
    targetPort: 8000
    protocol: TCP
    name: http
```

## Network Flow Diagrams

### 1. MCP Client → LangGraph Flow

```
Step 1: Client initiates request
┌──────────────┐
│ ChatGPT      │ POST /sse
│ Enterprise   │ {method: "tools/call", name: "search_products"}
└──────┬───────┘
       │ HTTPS/SSE
       ▼
┌──────────────┐
│ WAF          │ Validate IP, Rate limit
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Load Balancer│ Route to healthy MCP pod
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────┐
│ MCP Server Pod 1                     │
│                                      │
│ 1. Receive SSE request               │
│ 2. Parse tool call                   │
│ 3. Map to agent endpoint             │
│    search_products → catalog agent   │
└──────┬───────────────────────────────┘
       │ HTTP POST
       │ /api/mcp/agents/catalog
       │ Headers: X-MCP-API-Key
       ▼
┌──────────────────────────────────────┐
│ Next.js API Pod 2                    │
│                                      │
│ 1. Verify MCP_API_KEY                │
│ 2. Extract action, threadId          │
│ 3. Call LangGraph SDK                │
└──────┬───────────────────────────────┘
       │ LangGraph SDK
       │ HTTP/gRPC
       ▼
┌──────────────────────────────────────┐
│ LangGraph Server                     │
│                                      │
│ 1. Load graph (catalog_graph)       │
│ 2. Create/resume thread              │
│ 3. Execute agent workflow            │
│ 4. Call LLM (OpenAI)                 │
│ 5. Execute tools/actions             │
│ 6. Save state to PostgreSQL          │
└──────┬───────────────────────────────┘
       │ Return
       │ {messages: [...]}
       ▼
┌──────────────────────────────────────┐
│ Next.js API Pod 2                    │
│ Return response to MCP               │
└──────┬───────────────────────────────┘
       │ HTTP Response
       ▼
┌──────────────────────────────────────┐
│ MCP Server Pod 1                     │
│ 1. Extract AI message                │
│ 2. Format as MCP response            │
│ 3. Stream via SSE                    │
└──────┬───────────────────────────────┘
       │ SSE Stream
       ▼
┌──────────────┐
│ ChatGPT      │ Receive tool result
│ Enterprise   │ Continue conversation
└──────────────┘
```

### 2. Direct User → LangGraph Flow (Web UI)

```
┌──────────────┐
│ User Browser │ POST /api/chat
│              │ {message: "Show me deals"}
└──────┬───────┘
       │ HTTPS
       ▼
┌──────────────┐
│ Load Balancer│ → Next.js
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────┐
│ Next.js API Pod 1                    │
│                                      │
│ 1. Auth0 middleware validates user   │
│ 2. Extract user session              │
│ 3. Route to /api/chat                │
└──────┬───────────────────────────────┘
       │ LangGraph SDK
       ▼
┌──────────────────────────────────────┐
│ LangGraph Server                     │
│                                      │
│ 1. Load supervisor graph             │
│ 2. Route to deals agent              │
│ 3. Execute agent                     │
│ 4. Return results                    │
└──────┬───────────────────────────────┘
       │ Response
       ▼
┌──────────────────────────────────────┐
│ Next.js API Pod 1                    │
│ Stream response to browser           │
└──────┬───────────────────────────────┘
       │ HTTP Stream
       ▼
┌──────────────┐
│ User Browser │ Display results
└──────────────┘
```

## Configuration Details

### Environment Variables by Service

#### MCP Server
```bash
# MCP Server Environment
NEXTJS_URL=http://nextjs-service:3000
MCP_API_KEY=<secure-key>
MCP_SERVER_PORT=3001
MCP_SERVER_HOST=0.0.0.0
NODE_ENV=production
```

#### Next.js Application
```bash
# Next.js Environment
APP_BASE_URL=https://yourdomain.com
AUTH0_SECRET=<secure-secret>
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=<client-id>
AUTH0_CLIENT_SECRET=<client-secret>
AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com

# Database
DATABASE_URL=postgresql://user:pass@postgres-service:5432/db

# LangGraph
LANGGRAPH_API_URL=http://langgraph-service:8000
# OR for LangGraph Cloud:
LANGGRAPH_API_URL=https://your-deployment.langchain.com
LANGCHAIN_API_KEY=<langchain-api-key>

# MCP
MCP_API_KEY=<same-as-mcp-server>

# OpenAI
OPENAI_API_KEY=<openai-key>

# LangSmith Tracing
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=<langsmith-key>
LANGCHAIN_PROJECT=shopping-assistant-prod
```

#### LangGraph Server (Self-Hosted)
```bash
# LangGraph Server Environment
DATABASE_URL=postgresql://user:pass@postgres-service:5432/langgraph
REDIS_URL=redis://redis-service:6379
OPENAI_API_KEY=<openai-key>
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=<langsmith-key>
LANGCHAIN_PROJECT=shopping-assistant-langgraph
```

## Service Mesh / DNS

```
Internal Service Discovery:

mcp-service.shopping-assistant.svc.cluster.local:3001
  ↓
nextjs-service.shopping-assistant.svc.cluster.local:3000
  ↓
langgraph-service.shopping-assistant.svc.cluster.local:8000
  ↓
postgres-service.shopping-assistant.svc.cluster.local:5432
redis-service.shopping-assistant.svc.cluster.local:6379
```

## Scaling Strategy

### Auto-Scaling Configuration

```yaml
# MCP Server HPA
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: mcp-server-hpa
  namespace: shopping-assistant
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: mcp-server
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
---
# Next.js HPA
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: nextjs-hpa
  namespace: shopping-assistant
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: nextjs
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
---
# LangGraph Server HPA
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: langgraph-hpa
  namespace: shopping-assistant
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: langgraph-server
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 75
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 85
```

## Monitoring & Observability

### Key Metrics to Track

```yaml
# Prometheus ServiceMonitor
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: shopping-assistant-metrics
  namespace: shopping-assistant
spec:
  selector:
    matchLabels:
      monitoring: "true"
  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics
```

**Metrics:**
- MCP Server: Request count, latency, error rate, SSE connections
- Next.js: API response times, Auth0 auth failures, LangGraph SDK calls
- LangGraph: Agent execution time, LLM calls, state saves, tool invocations
- Infrastructure: CPU, memory, network I/O, pod restarts

### Distributed Tracing

```
┌──────────────┐
│   Request    │ trace_id: abc123
└──────┬───────┘
       │
       ▼
┌──────────────┐ span: mcp-server
│ MCP Server   │ duration: 1.2s
└──────┬───────┘
       │
       ▼
┌──────────────┐ span: nextjs-api
│ Next.js API  │ duration: 1.1s
└──────┬───────┘
       │
       ▼
┌──────────────┐ span: langgraph-exec
│ LangGraph    │ duration: 900ms
│ Server       │   span: llm-call (700ms)
└──────────────┘   span: tool-exec (150ms)
```

## Summary

### Complete Stack
- ✅ **MCP Server**: SSE transport, port 3001, stateless, scalable
- ✅ **Next.js API**: Port 3000, Auth0 integration, LangGraph SDK client
- ✅ **LangGraph Server**: Agent runtime, state management, LLM orchestration
- ✅ **PostgreSQL**: State persistence, checkpointer storage
- ✅ **Redis**: Caching, session management
- ✅ **Load Balancers**: Traffic distribution, health checks
- ✅ **WAF**: IP whitelisting, rate limiting, DDoS protection
- ✅ **Monitoring**: Prometheus, Grafana, LangSmith tracing

### Deployment Options
1. **LangGraph Cloud** (Managed): Easiest, pay-as-you-go, fully managed
2. **Self-Hosted LangGraph**: Full control, your infrastructure, Kubernetes

Both architectures are production-ready and enterprise-grade! 🚀
