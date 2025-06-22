use anchor_lang::prelude::*;

#[account]
pub struct DialConfig {
    pub authority: Pubkey,
    pub keeper_bot_wallet: Pubkey,
    pub treasury_wallet: Pubkey,
    pub current_reward_token: Pubkey,
    pub current_token_symbol: String,
    pub last_update: i64,
    pub total_updates: u64,
    pub initialized: bool,
    pub bump: u8,
}

impl DialConfig {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // keeper_bot_wallet
        32 + // treasury_wallet
        32 + // current_reward_token
        32 + // current_token_symbol (max 32 chars)
        8 +  // last_update
        8 +  // total_updates
        1 +  // initialized
        1 +  // bump
        64;  // padding
}