use anchor_lang::prelude::*;

pub const VAULT_SEED: &[u8] = b"vault";
pub const VAULT_AUTH_SEED: &[u8] = b"vault_auth";
pub const HOLDER_SEED: &[u8] = b"holder";

pub const EXCLUSION_FEE: u8 = 1;
pub const EXCLUSION_REWARD: u8 = 2;
pub const EXCLUSION_BOTH: u8 = 3;

pub const OWNER_SHARE_BASIS_POINTS: u16 = 100; // 1% (100 basis points out of 10000)
pub const TREASURY_SHARE_BASIS_POINTS: u16 = 400; // 4% (400 basis points out of 10000)
pub const TOTAL_TAX_BASIS_POINTS: u16 = 500; // 5% total

pub const MIN_KEEPER_SOL_BALANCE: u64 = 50_000_000; // 0.05 SOL in lamports
pub const TARGET_KEEPER_SOL_BALANCE: u64 = 100_000_000; // 0.1 SOL in lamports

pub const MAX_EXCLUSIONS: usize = 100; // Maximum number of exclusions per type
