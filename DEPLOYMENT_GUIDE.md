# LangGraph Server Deployment Guide

## Overview

This application uses a **fully separated architecture** where:
- **Next.js UI** handles authentication and user interface
- **LangGraph Server** runs all agent logic (supervisor + specialized agents)

## Deployment Options

### Option 1: LangGraph Cloud (Recommended for Production)

**Advantages:**
- Managed infrastructure
- Built-in scaling and monitoring
- Automatic checkpointing and persistence
- Zero server management

**Steps:**

1. **Sign up for LangGraph Cloud**
   ```bash
   # Visit: https://langchain.com/langgraph-cloud
   ```

2. **Build and deploy**
   ```bash
   npm run langgraph:build
   npm run langgraph:deploy:prod
   ```

3. **Get deployment URL**
   - After deployment, you'll receive a URL like: `https://your-deployment.langchain.app`
   - Update `.env.local`: `LANGGRAPH_SERVER_URL=https://your-deployment.langchain.app`

4. **Configure environment variables in LangGraph Cloud**
   - Set all required environment variables from `.env.local`:
     - `OPENAI_API_KEY`
     - `AUTH0_*` variables
     - `DATABASE_URL`
     - `SHOP_API_URL` / `SHOP_API_AUDIENCE`
     - `ADD_PAYMENT_API_URL` / `ADD_PAYMENT_API_AUDIENCE`
     - `PUSHOVER_TOKEN` / `PUSHOVER_USER`
     - `LANGCHAIN_API_KEY`

---

### Option 2: Docker Container (Self-Hosted)

**Advantages:**
- Full control over infrastructure
- Can run on any cloud provider (AWS, GCP, Azure, DigitalOcean)
- Cost-effective for consistent workloads

**Steps:**

1. **Create Dockerfile for LangGraph Server**

   Create `langgraph.Dockerfile`:
   ```dockerfile
   FROM node:20-slim

   WORKDIR /app

   # Copy package files
   COPY package*.json ./
   RUN npm ci --only=production

   # Copy application code
   COPY . .

   # Build if needed
   RUN npm run build || echo "No build step needed"

   # Expose LangGraph server port
   EXPOSE 2024

   # Run LangGraph server
   CMD ["npx", "@langchain/langgraph-cli", "dev", "--host", "0.0.0.0", "--port", "2024"]
   ```

2. **Build Docker image**
   ```bash
   docker build -f langgraph.Dockerfile -t langgraph-server .
   ```

3. **Run container**
   ```bash
   docker run -p 2024:2024 \
     --env-file .env.local \
     langgraph-server
   ```

4. **Deploy to cloud**
   - **AWS ECS/Fargate**: Use task definition with the image
   - **GCP Cloud Run**: Deploy container directly
   - **Azure Container Instances**: Deploy with environment variables
   - **Kubernetes**: Create deployment + service manifests

---

### Option 3: Server/VPS (Traditional Hosting)

**Advantages:**
- Simple deployment
- Good for development/staging environments
- Easy debugging

**Steps:**

1. **Provision server**
   - Ubuntu 22.04 LTS (or similar)
   - Minimum 2GB RAM, 2 vCPUs

2. **Install Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Clone and setup**
   ```bash
   git clone <your-repo>
   cd auth0-genai-nextjs-langchain
   npm ci
   ```

4. **Configure environment**
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local with production values
   ```

5. **Setup process manager (PM2)**
   ```bash
   npm install -g pm2
   
   # Start LangGraph server
   pm2 start npm --name langgraph-server -- run dev:langgraph
   pm2 save
   pm2 startup
   ```

6. **Configure reverse proxy (nginx)**
   ```nginx
   server {
       listen 80;
       server_name langgraph.yourdomain.com;

       location / {
           proxy_pass http://localhost:2024;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           
           # Important for SSE streaming
           proxy_buffering off;
           proxy_cache off;
       }
   }
   ```

7. **Setup SSL with Let's Encrypt**
   ```bash
   sudo apt-get install certbot python3-certbot-nginx
   sudo certbot --nginx -d langgraph.yourdomain.com
   ```

---

## Step 5: Production Environment Variables

### Next.js App (.env.production)

Create `.env.production` for your Next.js deployment:

```bash
# App Configuration
APP_BASE_URL="https://your-app.com"
NEXTAUTH_URL="https://your-app.com"

# Auth0 Configuration
AUTH0_SECRET="<generate-new-secret-for-production>"
AUTH0_DOMAIN="your-tenant.auth0.com"
AUTH0_CLIENT_ID="<production-client-id>"
AUTH0_CLIENT_SECRET="<production-client-secret>"
AUTH0_ISSUER_BASE_URL="https://your-tenant.auth0.com"
AUTH0_TOKEN_ENDPOINT="https://your-tenant.auth0.com/oauth/token"

# LangGraph Server URL (CRITICAL - Update this!)
LANGGRAPH_SERVER_URL="https://your-langgraph-deployment.com"

# OpenAI API
OPENAI_API_KEY="<production-openai-key>"

# Database
DATABASE_URL="<production-postgres-url>"

# Shop APIs
SHOP_API_URL="https://your-app.com/api/checkout"
SHOP_API_AUDIENCE="https://your-app.com/api/checkout"
ADD_PAYMENT_API_URL="https://your-app.com/api/add-payment"
ADD_PAYMENT_API_AUDIENCE="https://your-app.com/api/add-payment"

# LangSmith Tracing
LANGCHAIN_TRACING_V2="true"
LANGCHAIN_API_KEY="<production-langsmith-key>"
LANGCHAIN_PROJECT="auth0-shopping-agent-prod"
LANGCHAIN_ENDPOINT="https://api.smith.langchain.com"

# Notifications
PUSHOVER_TOKEN="<production-pushover-token>"
PUSHOVER_USER="<production-pushover-user>"

# Identity Provider
IDENTITY_PROVIDER="auth0"
```

### LangGraph Server Environment

Ensure these variables are set in your LangGraph deployment:
- All OpenAI, Auth0, Database, and API credentials
- Make sure `SHOP_API_URL` points to your production Next.js deployment

---

## Step 6: Deployment Validation

### 1. Health Checks

**LangGraph Server Health:**
```bash
curl https://your-langgraph-deployment.com/health
# Should return: {"status": "healthy"}
```

**Create Test Thread:**
```bash
curl -X POST https://your-langgraph-deployment.com/threads \
  -H "Content-Type: application/json" \
  -d '{"metadata": {"test": true}}'
# Should return thread_id
```

### 2. End-to-End Test

**From Next.js UI:**
1. Open browser to `https://your-app.com`
2. Sign in with Auth0
3. Send test message: "Show me some apples"
4. Verify:
   - ✅ Response streams correctly
   - ✅ Supervisor routes to catalog agent
   - ✅ Products are returned
   - ✅ No console errors

### 3. Monitor Logs

**Next.js Logs:**
```bash
# Check proxy is forwarding correctly
[chat-proxy] Processing request for user: <user-id>
[chat-proxy] Thread ID: <thread-id>
[chat-proxy] Streaming response from LangGraph server...
```

**LangGraph Server Logs:**
```bash
# Check agents are executing
[inputTransformer] Converting messages...
[planner] Extracted messages for LLM
[supervisor] Routing to agent: catalog
```

### 4. Performance Validation

Run load tests:
```bash
# Install k6
brew install k6

# Run test
k6 run --vus 10 --duration 30s test-script.js
```

### 5. Error Monitoring

Setup monitoring for:
- **Response times** (should be < 5s for most queries)
- **Error rates** (should be < 1%)
- **Thread creation failures**
- **Agent routing errors**

---

## Rollback Plan

If issues occur:

1. **Quick rollback:**
   ```bash
   # Update Next.js environment to point to previous LangGraph deployment
   LANGGRAPH_SERVER_URL="https://previous-deployment.com"
   ```

2. **Verify old deployment still works:**
   ```bash
   curl https://previous-deployment.com/health
   ```

3. **Redeploy Next.js with old URL**

---

## Security Checklist

- [ ] All Auth0 secrets rotated for production
- [ ] Database uses SSL/TLS connections
- [ ] LangGraph server URL uses HTTPS
- [ ] API keys are not exposed in client-side code
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] Logging doesn't expose sensitive data

---

## Support

For issues:
1. Check logs in both Next.js and LangGraph deployments
2. Verify environment variables are correctly set
3. Test each component independently (UI → Proxy → LangGraph)
4. Review LangSmith traces for debugging agent behavior
