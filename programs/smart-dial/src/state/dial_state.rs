use anchor_lang::prelude::*;

#[account]
pub struct DialState {
    /// Program authority who can update settings
    pub authority: Pubkey,
    
    /// Current reward token to be used for distributions
    pub current_reward_token: Pubkey,
    
    /// Treasury wallet where 4% of fees go
    pub treasury_wallet: Pubkey,
    
    /// Timestamp of last update
    pub last_update: i64,
    
    /// Total number of updates made
    pub update_count: u32,
    
    /// Whether the dial has been initialized
    pub is_initialized: bool,
    
    /// Bump seed for PDA
    pub bump: u8,
}

impl DialState {
    pub const LEN: usize = crate::constants::DIAL_STATE_SIZE;
    
    /// Check if enough time has passed for a new update (1 day minimum)
    pub fn can_update(&self, current_timestamp: i64) -> bool {
        current_timestamp - self.last_update >= 86400 // 24 hours in seconds
    }
    
    /// Update the reward token
    pub fn update_reward_token(&mut self, new_token: Pubkey, timestamp: i64) -> Result<()> {
        self.current_reward_token = new_token;
        self.last_update = timestamp;
        self.update_count = self.update_count.saturating_add(1);
        Ok(())
    }
    
    /// Update the treasury wallet
    pub fn update_treasury(&mut self, new_treasury: Pubkey) -> Result<()> {
        self.treasury_wallet = new_treasury;
        Ok(())
    }
}