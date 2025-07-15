FROM ubuntu:22.04

# Set non-interactive frontend
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update -qq && apt-get upgrade -qq && apt-get install -qq \
    build-essential \
    git \
    curl \
    wget \
    jq \
    pkg-config \
    python3-pip \
    libssl-dev \
    libudev-dev \
    ca-certificates \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Rust
RUN curl "https://sh.rustup.rs" -sfo rustup.sh && \
    sh rustup.sh -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN rustup component add rustfmt clippy

# Install Node.js (required for Anchor)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Solana CLI
ENV SOLANA_VERSION=v1.18.17
RUN sh -c "$(curl -sSfL https://release.anza.xyz/${SOLANA_VERSION}/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

# Install Anchor CLI
ENV ANCHOR_VERSION=0.30.1
RUN cargo install --git https://github.com/coral-xyz/anchor --tag v${ANCHOR_VERSION} anchor-cli

# Set up workspace
WORKDIR /workspace

# Create programs directory structure
RUN mkdir -p programs/{absolute-vault,smart-dial,transfer-hook}

# Verify installations
RUN solana --version && anchor --version && rustc --version && node --version

# Set Solana to devnet by default
RUN solana config set --url https://api.devnet.solana.com

# Keep container running
CMD ["tail", "-f", "/dev/null"]