use anchor_lang::prelude::*;
use crate::constants::MAX_HOLDERS_PER_REGISTRY;

#[account]
pub struct HolderRegistry {
    pub holders: Vec<Pubkey>,
    pub balances: Vec<u64>,
    pub last_update: i64,
    pub total_eligible: u64,
}

impl HolderRegistry {
    pub const LEN: usize = 8 + // discriminator
        4 + (32 * MAX_HOLDERS_PER_REGISTRY) + // holders vec
        4 + (8 * MAX_HOLDERS_PER_REGISTRY) +  // balances vec
        8 + // last_update
        8 + // total_eligible
        64; // padding
}