#!/bin/bash

# Stop the mainnet fork test validator

echo "Stopping mainnet fork test validator..."

if [ -f test-validator.pid ]; then
    PID=$(cat test-validator.pid)
    if ps -p $PID > /dev/null; then
        kill $PID
        echo "✅ Test validator stopped (PID: $PID)"
        rm test-validator.pid
    else
        echo "⚠️  Test validator process not found (PID: $PID)"
        rm test-validator.pid
    fi
else
    echo "❌ No test-validator.pid file found"
    echo "Attempting to find and kill solana-test-validator process..."
    pkill -f solana-test-validator && echo "✅ Killed solana-test-validator process" || echo "❌ No solana-test-validator process found"
fi

# Clean up ledger if requested
if [ "$1" = "--clean" ]; then
    echo "Cleaning up test ledger..."
    rm -rf ./test-ledger
    echo "✅ Test ledger cleaned"
fi