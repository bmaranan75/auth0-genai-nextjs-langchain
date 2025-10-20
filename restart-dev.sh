#!/bin/bash

echo "================================"
echo "Restarting Dev Environment"
echo "================================"

# Stop any running processes on ports 3000 and 8123
echo "Stopping existing processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:8123 | xargs kill -9 2>/dev/null || true

# Clear Next.js cache
echo "Clearing Next.js cache..."
rm -rf .next

# Rebuild the application
echo "Building application..."
npm run build

# Start the dev server
echo "Starting dev server..."
npm run dev

