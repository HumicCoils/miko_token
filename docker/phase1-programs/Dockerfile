# Phase 1: Core Programs Development
FROM rust:1.81-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    curl \
    wget \
    git \
    build-essential \
    bzip2 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Solana CLI 1.18.23 from GitHub releases
ENV SOLANA_VERSION=v1.18.23
RUN cd /tmp && \
    wget -q https://github.com/anza-xyz/agave/releases/download/${SOLANA_VERSION}/solana-release-x86_64-unknown-linux-gnu.tar.bz2 && \
    tar -xf solana-release-x86_64-unknown-linux-gnu.tar.bz2 && \
    mv solana-release/bin/* /usr/local/bin/ && \
    rm -rf /tmp/solana-*

# Verify Solana installation
RUN solana --version

# Install Anchor via Cargo (using the specific version)
RUN cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli --locked

# Install Node.js 20 for Anchor tests
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

# Install Yarn
RUN npm install -g yarn

# Set working directory
WORKDIR /workspace

# Create directory for shared artifacts
RUN mkdir -p /shared-artifacts

# Verify all installations work
RUN solana --version && \
    anchor --version && \
    node --version && \
    yarn --version && \
    rustc --version

# Default command
CMD ["/bin/bash"]