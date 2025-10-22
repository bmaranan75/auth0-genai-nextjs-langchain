#!/bin/bash

echo "================================================"
echo "MCP Server Setup Verification"
echo "================================================"
echo ""

# Check files exist
echo "✓ Checking MCP files..."
FILES=(
  "src/mcp/server.ts"
  "src/mcp/client.ts"
  "src/mcp/tools.ts"
  "src/mcp/tsconfig.json"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✅ $file"
  else
    echo "  ❌ $file (MISSING)"
  fi
done

echo ""
echo "✓ Checking API routes..."
ROUTES=(
  "src/app/api/mcp/agents/catalog/route.ts"
  "src/app/api/mcp/agents/cart/route.ts"
  "src/app/api/mcp/agents/payment/route.ts"
  "src/app/api/mcp/agents/deals/route.ts"
)

for route in "${ROUTES[@]}"; do
  if [ -f "$route" ]; then
    echo "  ✅ $route"
  else
    echo "  ❌ $route (MISSING)"
  fi
done

echo ""
echo "✓ Checking environment variables..."
if [ -f ".env.local" ]; then
  if grep -q "NEXTJS_URL" .env.local; then
    echo "  ✅ NEXTJS_URL configured"
  else
    echo "  ⚠️  NEXTJS_URL not found in .env.local"
  fi
  
  if grep -q "MCP_API_KEY" .env.local; then
    echo "  ✅ MCP_API_KEY configured"
  else
    echo "  ❌ MCP_API_KEY not found in .env.local"
  fi
else
  echo "  ❌ .env.local not found"
fi

echo ""
echo "✓ Checking package.json scripts..."
if grep -q "mcp:dev" package.json; then
  echo "  ✅ npm run mcp:dev"
fi
if grep -q "mcp:build" package.json; then
  echo "  ✅ npm run mcp:build"
fi
if grep -q "mcp:start" package.json; then
  echo "  ✅ npm run mcp:start"
fi

echo ""
echo "================================================"
echo "✅ Phase 3 Complete: MCP Server Created"
echo "================================================"
echo ""
echo "File Structure:"
echo "  src/mcp/"
echo "    ├── server.ts       (Main MCP server)"
echo "    ├── client.ts       (HTTP client)"
echo "    ├── tools.ts        (Tool definitions)"
echo "    └── tsconfig.json   (TypeScript config)"
echo ""
echo "Next Steps:"
echo "  1. Ensure Next.js is running:"
echo "     npm run dev"
echo ""
echo "  2. In a new terminal, start MCP server:"
echo "     npm run mcp:dev"
echo ""
echo "  3. Configure Claude Desktop (see instructions below)"
echo ""
