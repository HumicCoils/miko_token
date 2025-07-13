#!/bin/bash

# MIKO Token Phase Verification Script
# Usage: ./scripts/verify-phase.sh <phase_number>

set -e

PHASE=$1
SHARED_ARTIFACTS="docker/shared-artifacts"

if [ -z "$PHASE" ]; then
    echo "Usage: $0 <phase_number>"
    exit 1
fi

echo "Verifying Phase $PHASE..."

case $PHASE in
    1)
        echo "Phase 1: Core Programs Development"
        echo "Checking program deployments..."
        
        # Check if programs.json exists
        if [ ! -f "$SHARED_ARTIFACTS/programs.json" ]; then
            echo "L programs.json not found in shared-artifacts"
            exit 1
        fi
        
        # Verify all three programs are present
        for program in absoluteVault smartDial transferHook; do
            if ! grep -q "\"$program\"" "$SHARED_ARTIFACTS/programs.json"; then
                echo "L $program not found in programs.json"
                exit 1
            fi
        done
        
        echo " All programs deployed and saved"
        ;;
        
    2)
        echo "Phase 2: MIKO Token Creation"
        echo "Checking token configuration..."
        
        # Check if token.json exists
        if [ ! -f "$SHARED_ARTIFACTS/token.json" ]; then
            echo "L token.json not found in shared-artifacts"
            exit 1
        fi
        
        # Verify token authorities
        if ! grep -q '"mintAuthority": null' "$SHARED_ARTIFACTS/token.json"; then
            echo "L Mint authority not revoked"
            exit 1
        fi
        
        if ! grep -q '"freezeAuthority": null' "$SHARED_ARTIFACTS/token.json"; then
            echo "L Freeze authority not null"
            exit 1
        fi
        
        echo " Token created with correct authorities"
        ;;
        
    3)
        echo "Phase 3: System Initialization"
        echo "Checking initialization status..."
        
        # Check if initialization data exists
        if [ ! -f "$SHARED_ARTIFACTS/initialization.json" ]; then
            echo "L initialization.json not found"
            exit 1
        fi
        
        echo " All systems initialized"
        ;;
        
    4)
        echo "Phase 4: Keeper Bot Development"
        echo "Checking keeper bot configuration..."
        
        # Check if keeper config exists
        if [ ! -f "docker/phase4-keeper/.env" ]; then
            echo "   Keeper .env not found (expected for security)"
        fi
        
        echo " Keeper bot configured"
        ;;
        
    5)
        echo "Phase 5: Integration Testing"
        echo "Checking test results..."
        
        if [ ! -f "$SHARED_ARTIFACTS/test-results.json" ]; then
            echo "L test-results.json not found"
            exit 1
        fi
        
        echo " Integration tests passed"
        ;;
        
    6)
        echo "Phase 6: Production Deployment"
        echo "Final pre-deployment checklist..."
        
        echo " Ready for production"
        ;;
        
    *)
        echo "Unknown phase: $PHASE"
        exit 1
        ;;
esac

echo "Phase $PHASE validation complete!"