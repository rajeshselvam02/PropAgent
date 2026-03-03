#!/bin/bash
# PropAgent - Production Build Script

set -e

echo "🏗️ Building PropAgent for Production"
echo "====================================="

# Install dependencies
echo "Installing dependencies..."
npm ci --production

# Build all packages
echo "Building packages..."
npm run build --workspaces

# Security audit
echo "Running security audit..."
npm audit --audit-level=high || true

# Create logs directory
mkdir -p logs

# Generate strong API keys if not set
if [ -z "$MASTER_API_KEY" ]; then
    export MASTER_API_KEY=$(openssl rand -hex 32)
    echo "Generated MASTER_API_KEY (save this!): $MASTER_API_KEY"
fi

if [ -z "$JWT_SECRET" ]; then
    export JWT_SECRET=$(openssl rand -hex 32)
    echo "Generated JWT_SECRET (save this!): $JWT_SECRET"
fi

# Build Docker images
echo "Building Docker images..."
docker-compose build

echo ""
echo "✅ Build complete!"
echo ""
echo "To start in production:"
echo "  docker-compose up -d"
echo ""
echo "To stop:"
echo "  docker-compose down"
echo ""
