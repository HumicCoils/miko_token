# Phase 1: Foundation and Token Creation
FROM ubuntu:22.04

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    libudev-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install yarn
RUN npm install -g yarn

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Solana CLI 1.18.0
RUN curl -sSfL https://release.solana.com/v1.18.0/install > /tmp/install.sh && \
    sh /tmp/install.sh && \
    rm /tmp/install.sh
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

# Install Anchor 0.30.1
RUN cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
RUN /root/.cargo/bin/avm install 0.30.1
RUN /root/.cargo/bin/avm use 0.30.1

# Set working directory
WORKDIR /workspace

# Create entrypoint script
RUN echo '#!/bin/bash\nexec "$@"' > /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["/bin/bash"]