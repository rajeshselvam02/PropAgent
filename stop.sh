#!/bin/bash
# PropAgent Stop Script

echo "Stopping PropAgent..."

for port in 4000 4001 4002 4003; do
    pid=$(lsof -ti:$port 2>/dev/null)
    if [ -n "$pid" ]; then
        kill -9 $pid 2>/dev/null
        echo "Stopped service on port $port"
    fi
done

echo "✓ All services stopped"
