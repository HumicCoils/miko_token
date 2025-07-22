# Phase 2: MIKO Token Creation
FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install base dependencies
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    git \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 18 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs

# Install Solana CLI (v2.1.20 - same as Phase 1 for consistency)
RUN sh -c "$(curl -sSfL https://release.anza.xyz/v2.1.20/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

# Verify Solana installation
RUN /root/.local/share/solana/install/active_release/bin/solana --version

# Create workspace directory
WORKDIR /workspace

# Set Solana to devnet by default
RUN solana config set --url https://api.devnet.solana.com

# Create a volume mount point for shared artifacts
VOLUME ["/shared-artifacts"]

# Install TypeScript and required packages globally
RUN npm install -g typescript ts-node @types/node

# Keep container running for development
CMD ["/bin/bash"]