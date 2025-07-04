use anchor_lang::prelude::*;

#[account]
#[derive(Debug)]
pub struct VaultState {
    /// Program authority
    pub authority: Pubkey,
    
    /// Treasury wallet for collecting 4% share
    pub treasury: Pubkey,
    
    /// Owner wallet for collecting 1% share
    pub owner_wallet: Pubkey,
    
    /// MIKO token mint address
    pub token_mint: Pubkey,
    
    /// Minimum USD value required to be eligible for rewards ($100)
    pub min_hold_amount: u64,
    
    /// Current reward token mint (set by Smart Dial)
    pub reward_token_mint: Pubkey,
    
    /// Keeper bot wallet address
    pub keeper_wallet: Pubkey,
    
    /// Total fees harvested
    pub total_fees_harvested: u64,
    
    /// Total rewards distributed
    pub total_rewards_distributed: u64,
    
    /// Last harvest timestamp
    pub last_harvest_timestamp: i64,
    
    /// Last distribution timestamp
    pub last_distribution_timestamp: i64,
    
    /// Number of unique holders that have received rewards
    pub unique_reward_recipients: u64,
    
    /// Bump seed for PDA
    pub bump: u8,
    
    /// Reserved space for future upgrades
    pub _reserved: [u8; 128],
}

impl VaultState {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // treasury
        32 + // owner_wallet
        32 + // token_mint
        8 +  // min_hold_amount
        32 + // reward_token_mint
        32 + // keeper_wallet
        8 +  // total_fees_harvested
        8 +  // total_rewards_distributed
        8 +  // last_harvest_timestamp
        8 +  // last_distribution_timestamp
        8 +  // unique_reward_recipients
        1 +  // bump
        128; // _reserved
    
    /// Check if a wallet is a system account that should be auto-excluded
    pub fn is_system_account(&self, wallet: &Pubkey) -> bool {
        wallet == &self.authority ||
        wallet == &self.treasury ||
        wallet == &self.owner_wallet ||
        wallet == &self.keeper_wallet ||
        wallet == &crate::ID
    }
}