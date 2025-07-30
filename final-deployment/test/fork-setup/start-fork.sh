#!/bin/bash

# Start local mainnet fork for testing
# Uses real mainnet data and state

# Ensure Solana tools are in PATH
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

echo "Starting Solana mainnet fork..."

# Check if Solana is installed
if ! command -v solana-test-validator &> /dev/null; then
    echo "Error: solana-test-validator not found. Please install Solana CLI tools."
    exit 1
fi

# Check if bzip2 is installed (required for mainnet fork)
if ! command -v bzip2 &> /dev/null; then
    echo "Error: bzip2 not found. Installing..."
    sudo apt-get update && sudo apt-get install -y bzip2
fi

# Ensure default wallet exists
if [ ! -f "$HOME/.config/solana/id.json" ]; then
    echo "Creating default wallet..."
    solana-keygen new --no-passphrase --force
fi

# Kill any existing validator
pkill -f solana-test-validator 2>/dev/null
sleep 2

# Change to parent directory where programs are
cd /home/humiccoils/git/miko_token/final-deployment

# Clean up any existing test-ledger directory
rm -rf test-ledger/

# Start mainnet fork with all production programs
# Run in foreground mode - this script will keep running
echo "Starting mainnet fork with cloned programs..."
echo "This will clone the following mainnet programs:"
echo "  - Token Program (SPL Token)"
echo "  - Token-2022 Program"
echo "  - SOL (native mint)"
echo "  - USDC"
echo "  - Raydium AMM"
echo "  - Raydium CPMM"
echo "  - Jupiter programs"
echo ""
echo "Press Ctrl+C to stop the validator"
echo ""

# Build clone arguments
ARGS=""

# Core Solana Programs
ARGS+=" --clone 11111111111111111111111111111111"              # System Program
ARGS+=" --clone TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"   # Token Program
ARGS+=" --clone TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"   # Token-2022 Program
ARGS+=" --clone ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"  # Associated Token Program
ARGS+=" --clone ComputeBudget111111111111111111111111111111"   # Compute Budget

# Essential Token Mints
ARGS+=" --clone So11111111111111111111111111111111111111112"   # WSOL
ARGS+=" --clone EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"  # USDC

# Core Raydium CLMM Infrastructure
ARGS+=" --clone CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK"  # Raydium CLMM Program
ARGS+=" --clone 9iFER3bpjf1PTTCQCfTRu17EJgvsxo9pVyA9QWwEuX4x"  # AMM Config (Fee Tier 1bps)
ARGS+=" --clone 7oZEc4QrNa92AiTPzbEBvMdfbNKS6b2d78AbMRxqw1MF"  # Global ALT account
ARGS+=" --clone 4sKLJ1Qoudh8PJyqBeuKocYdsZvxTcRShUt9aKqwhgvC"  # Public ALT table

# Raydium Model/Authority
ARGS+=" --clone CDSr3ssLcRB6XYPJwAfFt18MZvEZp4LjHcvzBVZ45duo"  # Model Data
ARGS+=" --clone 7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5"  # Fee Destination

# Raydium AMM and CPMM (upgradeable)
ARGS+=" --clone 675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"  # OpenBook Market
ARGS+=" --clone-upgradeable-program CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"  # Raydium CPMM

# Raydium CPMM Config Accounts (required for pool creation)
ARGS+=" --clone D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2"  # CPMM Config 0 (0.25% fee)
ARGS+=" --clone DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8"  # CPMM Fee Receiver

# Jupiter for swaps
ARGS+=" --clone JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"  # Jupiter V6
ARGS+=" --clone JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB"  # Jupiter Aggregator v4
ARGS+=" --clone JUP3c2Uh3WA4Ng34tw6kPd2G4C5BB21Xo36Je1s32Ph"  # Jupiter v3

# Pyth Oracle Price Feeds
ARGS+=" --clone H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"  # SOL/USD
ARGS+=" --clone Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD"  # USDC/USD

# Metadata Program (for position NFTs)
ARGS+=" --clone metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"   # Metaplex Token Metadata

# Raydium ALTs for V0 transaction support
ARGS+=" --clone AcL1Vo8oy1ULiavEcjSUcwfBSForXMudcZvDZy5nzJkU"
ARGS+=" --clone 5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"

echo "Cloning 30+ mainnet accounts..."

# Start the test validator with mainnet fork
solana-test-validator \
  --url https://api.mainnet-beta.solana.com \
  --ledger ./test-ledger \
  --reset \
  --limit-ledger-size 50_000_000 \
  --rpc-port 8899 \
  --bind-address 127.0.0.1 \
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
    echo "Key accounts available:"
    echo "- Raydium CLMM: CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK"
    echo "- Raydium CPMM: CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"
    echo "- WSOL: So11111111111111111111111111111111111111112"
    echo "- USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    echo "- Jupiter V6: JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
    echo ""
    echo "To stop: pkill -f solana-test-validator"
else
    echo "❌ Failed to start validator. Check mainnet-fork.log for details."
    exit 1
fi