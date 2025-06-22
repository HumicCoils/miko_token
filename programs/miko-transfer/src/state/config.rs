use anchor_lang::prelude::*;

#[account]
pub struct TransferConfig {
    pub authority: Pubkey,
    pub miko_token_mint: Pubkey,
    pub absolute_vault_program: Pubkey,
    pub tax_holding_account: Pubkey,
    pub initialized: bool,
    pub bump: u8,
}

impl TransferConfig {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // miko_token_mint
        32 + // absolute_vault_program
        32 + // tax_holding_account
        1 +  // initialized
        1;   // bump
}