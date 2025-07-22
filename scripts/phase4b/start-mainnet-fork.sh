#!/bin/bash

# Phase 4-B: Structured Mainnet Fork Setup
# Separates fixed accounts (always needed) from dynamic accounts (transaction-specific)

echo "Starting Solana mainnet fork for Phase 4-B testing..."

# FIXED ACCOUNTS - Always required for Raydium CLMM operations
declare -a COMMON_CLONES=(
    # Core Raydium CLMM Infrastructure
    "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK"  # Raydium CLMM Program
    "9iFER3bpjf1PTTCQCfTRu17EJgvsxo9pVyA9QWwEuX4x"  # AMM Config (Fee Tier 1bps)
    "7oZEc4QrNa92AiTPzbEBvMdfbNKS6b2d78AbMRxqw1MF"  # Global ALT account
    "4sKLJ1Qoudh8PJyqBeuKocYdsZvxTcRShUt9aKqwhgvC"  # Public ALT table
    
    # Additional AMM Configs for different fee tiers
    # "CXrumVvh9qUPxLKb1KVxJSEa8isfYEJDaYXnAWktFHdo"  # Default 0.25% fee tier (doesn't exist on mainnet)
    
    # Raydium Model/Authority
    "CDSr3ssLcRB6XYPJwAfFt18MZvEZp4LjHcvzBVZ45duo"  # Model Data
    "7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5"  # Fee Destination
    
    # Core Solana Programs
    "11111111111111111111111111111111"              # System Program
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"   # Token Program
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"   # Token-2022 Program
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"  # Associated Token Program
    "ComputeBudget111111111111111111111111111111"   # Compute Budget
    
    # Essential Token Mints
    "So11111111111111111111111111111111111111112"   # WSOL
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"  # USDC
    
    # Jupiter for swaps
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"  # Jupiter V6
    
    # Pyth Oracle Price Feeds
    "H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"  # SOL/USD
    "Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD"  # USDC/USD
    
    # Metadata Program (for position NFTs)
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"   # Metaplex Token Metadata
    
    # All Raydium ALTs for V0 transaction support (only valid ones)
    "AcL1Vo8oy1ULiavEcjSUcwfBSForXMudcZvDZy5nzJkU"
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
)

# UPGRADEABLE PROGRAMS - Need special handling
declare -a UPGRADEABLE_PROGRAMS=(
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"  # OpenBook Market
    "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"  # Raydium CPMM
)

# Create test validator config directory
mkdir -p ./test-ledger

# Build clone arguments for fixed accounts
ARGS=""
for id in "${COMMON_CLONES[@]}"; do
    ARGS+=" --clone $id"
done

# Add upgradeable programs
for id in "${UPGRADEABLE_PROGRAMS[@]}"; do
    ARGS+=" --clone-upgradeable-program $id"
done

# Fork slot (use LATEST if not specified)
FORK_SLOT="${FORK_SLOT:-240000000}"

echo "Cloning ${#COMMON_CLONES[@]} fixed accounts and ${#UPGRADEABLE_PROGRAMS[@]} upgradeable programs..."
echo "Fork slot: $FORK_SLOT"

# Start the test validator with mainnet fork
echo "Starting test validator with mainnet fork..."
solana-test-validator \
  --url https://api.mainnet-beta.solana.com \
  --ledger ./test-ledger \
  --reset \
  --limit-ledger-size 50_000_000 \
  --rpc-port 8899 \
  --bind-address 127.0.0.1 \
  --warp-slot $FORK_SLOT \
  $ARGS \
  2>&1 | tee mainnet-fork.log &

# Save the process ID
echo $! > test-validator.pid

echo "Test validator starting..."
echo "RPC URL: http://127.0.0.1:8899"
echo "Process ID saved to test-validator.pid"

# Wait for validator to be ready
echo "Waiting for validator to be ready..."
sleep 15

# Check if validator is running
if solana cluster-version -u http://127.0.0.1:8899 2>/dev/null; then
    echo "✅ Mainnet fork is ready!"
    echo ""
    echo "Fixed accounts cloned: ${#COMMON_CLONES[@]}"
    echo "Upgradeable programs cloned: ${#UPGRADEABLE_PROGRAMS[@]}"
    echo ""
    echo "Key accounts available:"
    echo "- Raydium CLMM: CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK"
    echo "- AMM Config: 9iFER3bpjf1PTTCQCfTRu17EJgvsxo9pVyA9QWwEuX4x"
    echo "- WSOL: So11111111111111111111111111111111111111112"
    echo "- USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    echo "- Jupiter V6: JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
    echo ""
    echo "Dynamic accounts (pool PDAs, tick arrays, etc.) will be created as needed."
    echo ""
    echo "To stop the validator: ./stop-mainnet-fork.sh"
else
    echo "❌ Failed to start validator. Check mainnet-fork.log for details."
    exit 1
fi