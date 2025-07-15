FROM node:18-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Solana CLI
ENV SOLANA_VERSION=1.18.17
RUN sh -c "$(curl -sSfL https://release.anza.xyz/v${SOLANA_VERSION}/install)"

# Add Solana to PATH
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

# Install TypeScript and required packages
RUN npm install -g typescript ts-node

# Set up workspace
WORKDIR /workspace

# Install base dependencies for scripts
RUN npm init -y && \
    npm install @solana/web3.js@1.87.6 \
                @solana/spl-token@0.3.9 \
                dotenv \
                bs58

# Verify installations
RUN solana --version && node --version && npm --version

# Set Solana to devnet by default
RUN solana config set --url https://api.devnet.solana.com

# Keep container running
CMD ["tail", "-f", "/dev/null"]