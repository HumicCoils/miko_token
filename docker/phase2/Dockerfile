# Phase 2: Absolute Vault Program Development
FROM --platform=linux/amd64 ubuntu:22.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Update and install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    pkg-config \
    build-essential \
    libudev-dev \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js v20.19.3
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g yarn

# Install Rust 1.88.0
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.88.0
ENV PATH="/root/.cargo/bin:${PATH}"

# Update system and install additional dependencies
RUN apt-get update && apt-get install -y \
    bzip2 \
    && rm -rf /var/lib/apt/lists/*

# Download Solana binaries directly from GitHub
RUN wget https://github.com/anza-xyz/agave/releases/download/v1.18.23/solana-release-x86_64-unknown-linux-gnu.tar.bz2 && \
    tar -xjf solana-release-x86_64-unknown-linux-gnu.tar.bz2 && \
    mv solana-release/bin/* /usr/local/bin/ && \
    rm -rf solana-release*

# Verify Solana installation
RUN solana --version

# Install Anchor CLI 0.30.1
RUN cargo install --git https://github.com/coral-xyz/anchor avm --locked --force && \
    avm install 0.30.1 && \
    avm use 0.30.1

# Set working directory
WORKDIR /workspace

# Create directory structure
RUN mkdir -p /workspace/absolute-vault /shared-artifacts

# Set Solana to devnet
RUN solana config set --url https://api.devnet.solana.com

# Keep container running
CMD ["tail", "-f", "/dev/null"]