use anchor_lang::prelude::*;

/// PDA seed for the vault state account
pub const VAULT_SEED: &[u8] = b"vault";

/// PDA seed for token vault accounts
pub const TOKEN_VAULT_SEED: &[u8] = b"token_vault";

/// PDA seed for exclusion entries
pub const EXCLUSION_SEED: &[u8] = b"exclusion";

/// Fee split percentages (in basis points)
pub const OWNER_FEE_BPS: u16 = 100; // 1% of the 5% tax (20% of collected fees)
pub const TREASURY_FEE_BPS: u16 = 400; // 4% of the 5% tax (80% of collected fees)

/// Minimum SOL balance for keeper operations
pub const MIN_KEEPER_SOL_BALANCE: u64 = 50_000_000; // 0.05 SOL
pub const TARGET_KEEPER_SOL_BALANCE: u64 = 100_000_000; // 0.1 SOL

/// Maximum number of accounts to process in a single transaction
pub const MAX_ACCOUNTS_PER_TX: usize = 20;

/// Maximum number of holders to distribute to in a single transaction
pub const MAX_HOLDERS_PER_DISTRIBUTION: usize = 15;