use anchor_lang::prelude::*;

#[account]
pub struct TaxConfig {
    pub authority: Pubkey,
    pub miko_token_mint: Pubkey,
    pub fee_authority: Pubkey,
    pub withdraw_authority: Pubkey,
    pub smart_dial_program: Pubkey,
    pub keeper_bot_wallet: Pubkey,
    pub owner_wallet: Pubkey,
    pub treasury_wallet: Pubkey,
    pub total_fees_collected: u64,
    pub initialized: bool,
    pub bump: u8,
}

impl TaxConfig {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // miko_token_mint
        32 + // fee_authority
        32 + // withdraw_authority
        32 + // smart_dial_program
        32 + // keeper_bot_wallet
        32 + // owner_wallet
        32 + // treasury_wallet
        8 +  // total_fees_collected
        1 +  // initialized
        1 +  // bump
        64;  // padding
}