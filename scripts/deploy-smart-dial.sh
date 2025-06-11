#!/bin/bash
set -e

echo "Deploying Smart Dial program with controlled approach..."

# Generate a buffer keypair
BUFFER_KEYPAIR="target/deploy/smart_dial-buffer-keypair.json"
solana-keygen new -o $BUFFER_KEYPAIR --no-bip39-passphrase --force

# Get buffer address
BUFFER_ADDRESS=$(solana-keygen pubkey $BUFFER_KEYPAIR)
echo "Buffer address: $BUFFER_ADDRESS"

# Create buffer account with the exact size needed
PROGRAM_SIZE=$(stat -c%s target/deploy/smart_dial.so)
echo "Program size: $PROGRAM_SIZE bytes"

# Create the buffer account
solana program write-buffer target/deploy/smart_dial.so --buffer $BUFFER_KEYPAIR

# Now deploy from buffer to program
echo "Deploying from buffer to program..."
solana program deploy --program-id target/deploy/smart_dial-keypair.json --buffer $BUFFER_ADDRESS

# Get the program ID
PROGRAM_ID=$(solana-keygen pubkey target/deploy/smart_dial-keypair.json)
echo "Smart Dial deployed to: $PROGRAM_ID"

# Clean up buffer keypair
rm -f $BUFFER_KEYPAIR