use anchor_lang::prelude::*;

#[account]
pub struct TaxConfig {
    pub authority: Pubkey,           // One-time use, then burned
    pub tax_authority_pda: Pubkey,   // PDA for tax withdrawal
    pub tax_holding_pda: Pubkey,     // PDA for temporary holding
    pub smart_dial_program: Pubkey,  // Smart Dial program ID
    pub token_mint: Pubkey,          // MIKO token mint
    pub keeper_bot_wallet: Pubkey,   // Keeper bot authorized wallet
    pub owner_wallet: Pubkey,        // Owner wallet for 1% share
    pub initialized: bool,
    pub bump: u8,
}

impl TaxConfig {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // tax_authority_pda
        32 + // tax_holding_pda
        32 + // smart_dial_program
        32 + // token_mint
        32 + // keeper_bot_wallet
        32 + // owner_wallet
        1 +  // initialized
        1;   // bump
}