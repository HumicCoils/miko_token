#!/bin/bash

# Build script for MIKO Token programs
# Handles the build-sbf vs build-bpf compatibility issue

echo "Building MIKO Token programs..."

# Function to build a program
build_program() {
    local program_name=$1
    echo "Building $program_name..."
    
    cd "programs/$program_name"
    
    # Try cargo build-sbf first (newer toolchain)
    if cargo build-sbf 2>/dev/null; then
        echo "✓ $program_name built successfully with build-sbf"
    else
        # Fallback to build-bpf for older toolchain
        echo "build-sbf not found, trying build-bpf..."
        if cargo build-bpf; then
            echo "✓ $program_name built successfully with build-bpf"
        else
            echo "✗ Failed to build $program_name"
            exit 1
        fi
    fi
    
    cd ../..
}

# Build both programs
build_program "absolute-vault"
build_program "smart-dial"

# Create target/deploy directory if it doesn't exist
mkdir -p target/deploy

# Copy built programs to target/deploy
echo "Copying built programs to target/deploy..."
cp programs/absolute-vault/target/deploy/*.so target/deploy/ 2>/dev/null || true
cp programs/smart-dial/target/deploy/*.so target/deploy/ 2>/dev/null || true

# List deployed programs
echo ""
echo "Built programs:"
ls -la target/deploy/*.so

echo ""
echo "Build complete! Programs are ready for deployment."