use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum ExclusionType {
    /// Excluded from fee collection only
    FeeOnly = 0,
    /// Excluded from reward distribution only
    RewardOnly = 1,
    /// Excluded from both fee collection and reward distribution
    Both = 2,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum ExclusionAction {
    Add = 0,
    Remove = 1,
}

#[account]
#[derive(Debug)]
pub struct ExclusionEntry {
    /// The wallet address that is excluded
    pub wallet: Pubkey,
    
    /// Type of exclusion
    pub exclusion_type: ExclusionType,
    
    /// When this exclusion was created
    pub created_at: i64,
    
    /// Who added this exclusion
    pub added_by: Pubkey,
    
    /// Bump seed for PDA
    pub bump: u8,
}

impl ExclusionEntry {
    pub const LEN: usize = 8 + // discriminator
        32 + // wallet
        1 +  // exclusion_type
        8 +  // created_at
        32 + // added_by
        1;   // bump
    
    /// Check if this entry excludes from fee collection
    pub fn excludes_fees(&self) -> bool {
        matches!(self.exclusion_type, ExclusionType::FeeOnly | ExclusionType::Both)
    }
    
    /// Check if this entry excludes from reward distribution
    pub fn excludes_rewards(&self) -> bool {
        matches!(self.exclusion_type, ExclusionType::RewardOnly | ExclusionType::Both)
    }
}

/// Holder data passed in for distribution
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct HolderData {
    /// Wallet address of the holder
    pub wallet: Pubkey,
    
    /// Amount of MIKO tokens held
    pub balance: u64,
    
    /// USD value of holdings (balance * price)
    pub usd_value: u64,
}