#!/bin/bash

# Run verification tests for Phase 4-A

echo "Running MIKO Keeper Bot Verification Tests..."
echo "=========================================="

# Create logs directory if it doesn't exist
mkdir -p logs

# Create verification directory in shared-artifacts
mkdir -p ../docker/shared-artifacts/verification

# Run VC:4.FIRST_MONDAY test
echo ""
echo "Running VC:4.FIRST_MONDAY test..."
npm test -- tests/modules/TwitterMonitor.test.ts --verbose

# Run VC:4.TAX_FLOW_EDGE test
echo ""
echo "Running VC:4.TAX_FLOW_EDGE test..."
npm test -- tests/modules/TaxFlowEdgeCases.test.ts --verbose

# Copy verification artifacts to shared-artifacts
echo ""
echo "Copying verification artifacts..."
if [ -d "verification" ]; then
  cp verification/*.json ../docker/shared-artifacts/verification/
  echo "Verification artifacts copied to shared-artifacts"
fi

echo ""
echo "Verification tests complete!"
echo ""
echo "Check the following artifacts:"
echo "- ../docker/shared-artifacts/verification/vc4-first-monday.json"
echo "- ../docker/shared-artifacts/verification/vc4-tax-flow-edge.json"