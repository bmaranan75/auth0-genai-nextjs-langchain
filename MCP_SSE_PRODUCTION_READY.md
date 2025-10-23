# MCP Server with SSE Transport - Production Ready

## Overview

The MCP server has been converted from stdio transport to **SSE (Server-Sent Events)** transport, making it production-ready and suitable for both local development and cloud deployment (Kubernetes, Docker, etc.).

## What Changed?

### Transport Layer
- **Before:** stdio transport (stdin/stdout) - only works locally with Claude Desktop
- **After:** SSE transport over HTTP - works anywhere (local, cloud, multi-client)

### Architecture Benefits

1. **Production Ready**
   - Can be deployed to Kubernetes/Docker
   - Supports multiple concurrent clients
   - Works with load balancers
   - Health check endpoint for monitoring

2. **Flexible Client Support**
   - Claude Desktop (via SSE config)
   - ChatGPT Enterprise (via HTTP endpoint)
   - Cursor IDE (via SSE config)
   - Custom clients (any HTTP client)

3. **Zero Code Changes**
   - All agent logic remains identical
   - HTTP client to Next.js API unchanged
   - Tool definitions unchanged
   - Only transport layer updated

## Configuration

### Environment Variables

Add to `.env.local`:

```bash
# MCP Server Configuration
NEXTJS_URL=http://localhost:3000
MCP_API_KEY=your-secure-api-key-here
MCP_SERVER_PORT=3001
MCP_SERVER_HOST=0.0.0.0  # Accept connections from any IP
```

### Port Configuration

- **MCP Server:** Port 3001 (configurable via `MCP_SERVER_PORT`)
- **Next.js API:** Port 3000 (existing)
- **LangGraph Studio:** Port 2024 (existing)

All three services can run simultaneously on different ports.

## Running the Server

### Development Mode (with auto-reload)

```bash
npm run mcp:dev
```

This uses `tsx watch` for hot-reloading during development.

### Production Mode

```bash
# Build TypeScript to JavaScript
npm run mcp:build

# Start production server
npm run mcp:start

# Or both in one command
npm run mcp:prod
```

## Endpoints

### 1. Health Check

```bash
GET http://localhost:3001/health
```

Response:
```json
{
  "status": "healthy",
  "service": "safeway-shopping-assistant-mcp",
  "version": "1.0.0",
  "transport": "sse",
  "tools": [
    "search_products",
    "add_to_cart",
    "view_cart",
    "checkout",
    "add_payment_method",
    "get_deals"
  ]
}
```

### 2. SSE Endpoint (MCP Protocol)

```bash
POST http://localhost:3001/sse
```

This is the main MCP endpoint that clients connect to. It uses Server-Sent Events to stream responses.

## Testing

### Option 1: Health Check (Quick Test)

```bash
curl http://localhost:3001/health
```

### Option 2: Automated SSE Test

```bash
node scripts/test-mcp-sse.js
```

This script tests:
- ✅ Health check endpoint
- ✅ SSE connection establishment
- 📝 Provides Claude Desktop config

### Option 3: Web UI Test

```bash
# Open in browser
open http://localhost:3000/mcp-test.html
```

The web UI now connects to the MCP server via SSE and tests all tools.

## Client Configuration

### Claude Desktop

Edit: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "safeway-shopping-assistant": {
      "url": "http://localhost:3001/sse",
      "transport": "sse"
    }
  }
}
```

### Cursor IDE

Edit Cursor settings (similar to Claude Desktop):

```json
{
  "mcp.servers": {
    "safeway-shopping-assistant": {
      "url": "http://localhost:3001/sse",
      "transport": "sse"
    }
  }
}
```

### ChatGPT Enterprise

Configure custom action with:
- **URL:** `http://your-domain.com:3001/sse`
- **Method:** POST
- **Transport:** SSE

## Production Deployment

### Docker

Create `Dockerfile` for MCP server:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --production

# Copy built MCP server
COPY dist/mcp ./dist/mcp
COPY src/mcp/*.js ./src/mcp/

# Expose port
EXPOSE 3001

# Set production environment
ENV NODE_ENV=production
ENV MCP_SERVER_HOST=0.0.0.0
ENV MCP_SERVER_PORT=3001

# Start server
CMD ["node", "dist/mcp/server.js"]
```

Build and run:

```bash
docker build -t mcp-server -f Dockerfile.mcp .
docker run -p 3001:3001 \
  -e NEXTJS_URL=http://nextjs:3000 \
  -e MCP_API_KEY=your-api-key \
  mcp-server
```

### Kubernetes

Create `k8s/mcp-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-server
  namespace: shopping-assistant
spec:
  replicas: 3  # Multiple replicas for high availability
  selector:
    matchLabels:
      app: mcp-server
  template:
    metadata:
      labels:
        app: mcp-server
    spec:
      containers:
      - name: mcp-server
        image: your-registry/mcp-server:latest
        ports:
        - containerPort: 3001
          name: http
        env:
        - name: NEXTJS_URL
          value: "http://nextjs-service:3000"
        - name: MCP_API_KEY
          valueFrom:
            secretKeyRef:
              name: mcp-secrets
              key: api-key
        - name: MCP_SERVER_PORT
          value: "3001"
        - name: MCP_SERVER_HOST
          value: "0.0.0.0"
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 10
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: mcp-service
  namespace: shopping-assistant
spec:
  type: LoadBalancer
  selector:
    app: mcp-server
  ports:
  - port: 3001
    targetPort: 3001
    protocol: TCP
    name: http
---
apiVersion: v1
kind: Secret
metadata:
  name: mcp-secrets
  namespace: shopping-assistant
type: Opaque
stringData:
  api-key: "your-secure-api-key-here"
```

Deploy:

```bash
kubectl apply -f k8s/mcp-deployment.yaml
```

### Load Balancer Configuration

The SSE transport works with:
- **AWS ALB (Application Load Balancer)**
- **GCP Load Balancer**
- **Azure Load Balancer**
- **NGINX**
- **Traefik**

Example NGINX config:

```nginx
upstream mcp_backend {
    server mcp-server-1:3001;
    server mcp-server-2:3001;
    server mcp-server-3:3001;
}

server {
    listen 80;
    server_name mcp.yourdomain.com;

    location /health {
        proxy_pass http://mcp_backend;
        proxy_http_version 1.1;
    }

    location /sse {
        proxy_pass http://mcp_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # SSE specific settings
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
}
```

## Monitoring

### Health Check Monitoring

Use the `/health` endpoint for:
- Kubernetes liveness/readiness probes
- Load balancer health checks
- Monitoring tools (Prometheus, Datadog, etc.)

### Logging

The server logs to stderr with structured messages:

```
[MCP Server] Starting Safeway Shopping Assistant MCP Server...
[MCP Server] Transport: SSE (Server-Sent Events)
[MCP Server] Server URL: http://0.0.0.0:3001
[MCP Server] Listening on http://0.0.0.0:3001
[MCP Server] SSE endpoint: POST http://0.0.0.0:3001/sse
[MCP Server] Health check: GET http://0.0.0.0:3001/health
[MCP Server] Ready to receive MCP requests from clients
```

### Metrics

Consider adding:
- Request count per tool
- Response time per agent
- Error rate per endpoint
- Connection count

## Security

### API Key Authentication

The MCP server validates requests from clients, but the actual agent operations require `MCP_API_KEY` when calling Next.js API routes.

### CORS

Currently set to `Access-Control-Allow-Origin: *` for development. In production, restrict to specific origins:

```typescript
res.setHeader('Access-Control-Allow-Origin', 'https://yourdomain.com');
```

### HTTPS

In production, use HTTPS:
- Terminate SSL at load balancer
- Or use reverse proxy (NGINX with Let's Encrypt)
- Or use Kubernetes Ingress with TLS

## Scaling

### Horizontal Scaling

The SSE transport allows multiple replicas:

```bash
# Kubernetes
kubectl scale deployment mcp-server --replicas=5

# Docker Compose
docker-compose up --scale mcp-server=5
```

### Vertical Scaling

Adjust resources based on load:
- CPU: 100m-500m per replica
- Memory: 256Mi-512Mi per replica

## Troubleshooting

### Server Won't Start

```bash
# Check port availability
lsof -i :3001

# Check environment variables
env | grep MCP

# Check logs
npm run mcp:dev
```

### Clients Can't Connect

```bash
# Test health check
curl http://localhost:3001/health

# Test SSE endpoint
node scripts/test-mcp-sse.js

# Check firewall
# Ensure port 3001 is open
```

### Agent Calls Failing

```bash
# Test Next.js API directly
curl -X POST http://localhost:3000/api/mcp/agents/catalog \
  -H "Content-Type: application/json" \
  -H "X-MCP-API-Key: your-key" \
  -d '{"action": "search", "query": "bananas"}'
```

## Comparison: stdio vs SSE

| Feature | stdio | SSE (Production) |
|---------|-------|------------------|
| **Transport** | stdin/stdout | HTTP/SSE |
| **Deployment** | Local only | Local + Cloud |
| **Clients** | Single (Claude Desktop) | Multiple concurrent |
| **Load Balancing** | ❌ No | ✅ Yes |
| **Health Checks** | ❌ No | ✅ Yes |
| **Kubernetes** | ❌ No | ✅ Yes |
| **Docker** | ❌ No | ✅ Yes |
| **Monitoring** | ❌ Limited | ✅ Full observability |
| **Scaling** | ❌ No | ✅ Horizontal + Vertical |
| **Enterprise Ready** | ❌ No | ✅ Yes |

## Summary

✅ **What We Achieved:**
- Converted MCP server from stdio to SSE transport
- Made the server production-ready
- Zero changes to existing agent logic
- Maintained backward compatibility with all tools
- Added health check endpoint
- Added graceful shutdown
- Made it Kubernetes/Docker ready

🚀 **Ready For:**
- Local development (localhost:3001)
- Cloud deployment (Kubernetes, Docker)
- Enterprise integration (ChatGPT, Claude Desktop, Cursor)
- Load balancing and scaling
- Monitoring and observability

📝 **Next Steps:**
1. Run `npm run mcp:dev` to start the server
2. Test with `node scripts/test-mcp-sse.js`
3. Configure Claude Desktop with SSE endpoint
4. Deploy to production when ready
