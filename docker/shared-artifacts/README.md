# Shared Artifacts

This directory contains shared artifacts between Docker containers for different phases of MIKO token development.

## Artifact Files

### programs.json
Contains deployed program IDs for all on-chain programs:
- absoluteVault: Absolute Vault program ID
- smartDial: Smart Dial program ID  
- transferHook: Transfer Hook program ID

### token.json
Contains MIKO token creation details:
- mint: Token mint address
- vaultPDA: Vault Program Derived Address
- withdrawWithheldAuthority: Authority for withdrawing withheld fees
- transferFeeConfigAuthority: Authority for fee configuration
- mintAuthority: Should be null (revoked)
- freezeAuthority: Should be null
- createdAt: Token creation timestamp

## Usage

These files are mounted as volumes in Docker containers to share critical information between development phases without hardcoding values.