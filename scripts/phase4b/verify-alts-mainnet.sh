#!/bin/bash

echo "=== VERIFYING ALTs ON MAINNET ==="
echo ""

# List of ALTs to check
ALTS=(
    "2immgwYNHBbyVQKVGCEkgWpi53bLwWNRMB5G2nbgYV17"
    "2XizKJs3tB1AnxVb4jW2fZNS8v8mdXfiDibURAqtvc4D"
    "7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5"
    "BRm9x5p98rGTwyz46j8xuQzGS7qccgkfm5z6jw5Q4qv"
    "AcL1Vo8oy1ULiavEcjSUcwfBSForXMudcZvDZy5nzJkU"
    "5cRjHnvZjH1x9YGiUeeUP22dK4JTbEfJw9haMBB2uwJo"
    "CVBAPcNfpMUVfYSEUgNPAf9ds8aHhhVAcE9N3cMGfBc3"
    "GmVdwGmtNbNsF8zfZ6z9rXq2bY2kXddt6dtsXMW3bNrS"
    "E8erPjxvJpvcxBWtfCVLBgcRWGtmBmCTBMZet9tEsnsJ"
    "FyKgn4S4zrJ3aw9FJXwdHShTvJziD5KJVeyZGWhBNQ29"
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
)

VALID_ALTS=()

for ALT in "${ALTS[@]}"; do
    echo -n "Checking $ALT... "
    
    RESULT=$(curl -s -X POST https://api.mainnet-beta.solana.com -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getAccountInfo\",\"params\":[\"$ALT\",{\"encoding\":\"base58\"}]}" | jq -r '.result.value')
    
    if [ "$RESULT" != "null" ]; then
        echo "✅ EXISTS"
        VALID_ALTS+=("$ALT")
    else
        echo "❌ NOT FOUND"
    fi
done

echo ""
echo "=== VALID ALTs FOR FORK ==="
echo ""
COUNT=1
for ALT in "${VALID_ALTS[@]}"; do
    echo "RAYDIUM_ALT_$COUNT=\"$ALT\""
    ((COUNT++))
done

echo ""
echo "Total valid ALTs: ${#VALID_ALTS[@]}"