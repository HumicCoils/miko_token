FROM node:18-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install TypeScript and required packages
RUN npm install -g typescript ts-node nodemon

# Set up workspace
WORKDIR /workspace

# Create keeper-bot directory structure
RUN mkdir -p keeper-bot/{src,config}

# Install dependencies for keeper bot
RUN cd keeper-bot && npm init -y && \
    npm install @solana/web3.js@1.87.6 \
                @solana/spl-token@0.3.9 \
                @solana/spl-token-2022@0.1.0 \
                @coral-xyz/anchor@0.29.0 \
                node-cron \
                axios \
                winston \
                dotenv \
                bs58 \
                @types/node \
                @types/node-cron

# Verify installations
RUN node --version && npm --version

# Keep container running
CMD ["tail", "-f", "/dev/null"]