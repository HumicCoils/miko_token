use anchor_lang::prelude::*;

#[account]
pub struct SmartDialConfig {
    pub current_reward_token_mint: Pubkey,
    pub keeper_bot_pubkey: Pubkey,
    pub treasury_wallet: Pubkey,
    pub owner_wallet: Pubkey,
    pub ai_agent_twitter_id: String,  // @project_miko
    pub admin: Pubkey,                 // For emergency updates
    pub initialized: bool,
    pub bump: u8,
}

impl SmartDialConfig {
    pub const MAX_TWITTER_ID_LEN: usize = 32;
    
    pub const LEN: usize = 8 + // discriminator
        32 + // current_reward_token_mint
        32 + // keeper_bot_pubkey
        32 + // treasury_wallet
        32 + // owner_wallet
        4 + Self::MAX_TWITTER_ID_LEN + // String (length prefix + max content)
        32 + // admin
        1 +  // initialized
        1;   // bump
}

pub const SMART_DIAL_CONFIG_SEED: &[u8] = b"smart_dial_config";