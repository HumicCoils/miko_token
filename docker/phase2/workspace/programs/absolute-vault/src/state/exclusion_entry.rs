use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct ExclusionEntry {
    pub wallet: Pubkey,
    pub exclusion_type: u8, // 1 = FEE_EXCLUDED, 2 = REWARD_EXCLUDED, 3 = BOTH_EXCLUDED
    pub added_at: i64,
    pub bump: u8,
}

impl ExclusionEntry {
    pub const LEN: usize = 8 + // discriminator
        32 + // wallet
        1 + // exclusion_type
        8 + // added_at
        1; // bump
}
