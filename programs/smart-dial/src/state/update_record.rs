use anchor_lang::prelude::*;

#[account]
pub struct UpdateRecord {
    /// Timestamp when this update was made
    pub timestamp: i64,
    
    /// The reward token that was set
    pub reward_token: Pubkey,
    
    /// Who made the update (authority address)
    pub updated_by: Pubkey,
    
    /// Sequential index of this update
    pub update_index: u32,
    
    /// Bump seed for PDA
    pub bump: u8,
}

impl UpdateRecord {
    pub const LEN: usize = crate::constants::UPDATE_RECORD_SIZE;
}