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

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Solana CLI (v2.1.20 - compatible with Anchor 0.31.1)
RUN sh -c "$(curl -sSfL https://release.anza.xyz/v2.1.20/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"
# Verify Solana installation
RUN /root/.local/share/solana/install/active_release/bin/solana --version

# Install Node.js and npm (required for Anchor)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs

# Install Yarn (required for Anchor)
RUN npm install -g yarn

# Install Anchor CLI (version 0.31.1 - latest stable)
RUN cargo install --git https://github.com/coral-xyz/anchor --tag v0.31.1 anchor-cli --locked

# Create workspace directory
WORKDIR /workspace

# Set Solana to devnet by default
RUN solana config set --url https://api.devnet.solana.com

# Create a volume mount point for shared artifacts
VOLUME ["/shared-artifacts"]

# Keep container running for development
CMD ["/bin/bash"]