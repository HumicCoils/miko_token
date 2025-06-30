use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum ExclusionType {
    RewardExclusion,
    TaxExemption,
}

#[account]
pub struct ExclusionList {
    pub authority: Pubkey,
    pub reward_exclusions: Vec<Pubkey>,
    pub tax_exemptions: Vec<Pubkey>,
    pub bump: u8,
}

impl ExclusionList {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        4 + (32 * 50) + // reward_exclusions (max 50)
        4 + (32 * 50) + // tax_exemptions (max 50)
        1 + // bump
        64; // padding
        
    pub fn is_reward_excluded(&self, wallet: &Pubkey) -> bool {
        self.reward_exclusions.contains(wallet)
    }
    
    pub fn is_tax_exempt(&self, wallet: &Pubkey) -> bool {
        self.tax_exemptions.contains(wallet)
    }
}