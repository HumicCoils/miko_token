#!/bin/bash

# Deployment script with retry logic
MAX_RETRIES=3
RETRY_DELAY=5

# Array of RPC endpoints
RPC_ENDPOINTS=(
    "https://quaint-withered-smoke.solana-devnet.quiknode.pro/c6221fff8b39af9b097371daa653b38c57e061d4/"
    "https://api.devnet.solana.com"
    "https://solana-devnet.g.alchemy.com/v2/alch-demo"
    "https://rpc.helius.xyz/?api-key=HELIUS_API_KEY"
)

deploy_program() {
    local program_name=$1
    local program_path=$2
    local success=false
    
    echo "Deploying $program_name..."
    
    for rpc in "${RPC_ENDPOINTS[@]}"; do
        echo "Trying RPC: $rpc"
        
        for ((i=1; i<=MAX_RETRIES; i++)); do
            echo "Attempt $i of $MAX_RETRIES"
            
            if anchor deploy --provider.cluster "$rpc" --program-name "$program_name" 2>&1 | tee deploy.log; then
                echo "Successfully deployed $program_name!"
                success=true
                break 2
            else
                echo "Deployment failed, waiting $RETRY_DELAY seconds before retry..."
                sleep $RETRY_DELAY
            fi
        done
    done
    
    if [ "$success" = false ]; then
        echo "Failed to deploy $program_name after all attempts"
        return 1
    fi
    
    return 0
}

# Main deployment
echo "Starting deployment process..."

# Deploy absolute-vault
if ! deploy_program "absolute_vault" "./target/deploy/absolute_vault.so"; then
    echo "Failed to deploy absolute_vault"
    exit 1
fi

# Deploy smart-dial
if ! deploy_program "smart_dial" "./target/deploy/smart_dial.so"; then
    echo "Failed to deploy smart_dial"
    exit 1
fi

echo "All programs deployed successfully!"