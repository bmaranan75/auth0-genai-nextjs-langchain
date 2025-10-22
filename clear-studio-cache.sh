#!/bin/bash

# LangGraph Studio Cache Cleanup Script
# This script clears all caches that might cause Studio to show stale graph edges

set -e

echo "🧹 Cleaning LangGraph Studio caches..."
echo ""

# Step 1: Kill any running LangGraph processes
echo "1️⃣ Stopping LangGraph processes..."
pkill -f langgraph 2>/dev/null || echo "   No LangGraph processes running"
pkill -f "langgraph dev" 2>/dev/null || true
sleep 2

# Step 2: Remove TypeScript build cache
echo ""
echo "2️⃣ Removing TypeScript build cache..."
rm -f tsconfig.tsbuildinfo && echo "   ✅ Removed tsconfig.tsbuildinfo" || echo "   ℹ️  No tsbuildinfo found"

# Step 3: Remove Next.js build cache
echo ""
echo "3️⃣ Removing Next.js cache..."
rm -rf .next && echo "   ✅ Removed .next/" || echo "   ℹ️  No .next directory"

# Step 4: Remove node_modules cache
echo ""
echo "4️⃣ Removing node_modules cache..."
rm -rf node_modules/.cache && echo "   ✅ Removed node_modules/.cache/" || echo "   ℹ️  No cache found"

# Step 5: Remove LangGraph specific caches
echo ""
echo "5️⃣ Removing LangGraph cache..."
rm -rf .langgraph && echo "   ✅ Removed .langgraph/" || echo "   ℹ️  No .langgraph directory"
rm -rf .langgraph-cache && echo "   ✅ Removed .langgraph-cache/" || echo "   ℹ️  No cache found"

# Step 6: Remove any SQLite checkpointer databases (if using file-based checkpointers)
echo ""
echo "6️⃣ Checking for SQLite checkpointer databases..."
find . -name "*.db" -path "*/langgraph/*" -type f 2>/dev/null | while read -r db; do
    echo "   Found: $db"
    read -p "   Remove this database? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -f "$db" && echo "   ✅ Removed $db"
    fi
done

# Step 7: Rebuild the project
echo ""
echo "7️⃣ Rebuilding project..."
echo "   Running: npm run build"
echo ""
npm run build

echo ""
echo "✅ ============================================"
echo "✅ Cache cleanup complete!"
echo "✅ ============================================"
echo ""
echo "📋 Next steps:"
echo "   1. Start LangGraph Studio"
echo "   2. Open the 'supervisor' graph (NOT cart_and_checkout)"
echo "   3. Verify the graph structure:"
echo "      - cart_and_checkout should ONLY have edges to: [supervisor, END]"
echo "      - No direct edge to notification_agent"
echo ""
echo "🔍 If you still see the edge:"
echo "   - Confirm you're viewing the SUPERVISOR graph"
echo "   - Try restarting your computer (nuclear option)"
echo "   - This may be a LangGraph Studio display bug"
echo ""
