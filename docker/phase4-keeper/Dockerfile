# Phase 4: Keeper Bot Development Environment
FROM node:18-alpine AS base

# Install required packages
RUN apk add --no-cache \
    git \
    bash \
    curl \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /workspace

# Install TypeScript and required global packages
RUN npm install -g \
    typescript@^5.0.0 \
    ts-node@^10.0.0 \
    nodemon@^3.0.0 \
    pnpm@^8.0.0

# Set environment variables
ENV NODE_ENV=development
ENV PATH="/workspace/keeper-bot/node_modules/.bin:$PATH"

# Copy the keeper-bot directory structure
COPY keeper-bot/package*.json /workspace/keeper-bot/
COPY keeper-bot/tsconfig.json /workspace/keeper-bot/
COPY keeper-bot/jest.config.js /workspace/keeper-bot/

# Install dependencies
WORKDIR /workspace/keeper-bot
RUN npm install

# Copy source code
COPY keeper-bot/ /workspace/keeper-bot/

# Build the TypeScript code
RUN npm run build || true

# Default working directory
WORKDIR /workspace

# Default command
CMD ["bash"]