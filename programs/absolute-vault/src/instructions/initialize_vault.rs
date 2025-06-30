use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;
use anchor_spl::token_2022::Token2022;
use crate::{constants::*, state::TaxConfig};

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        seeds = [TAX_CONFIG_SEED],
        bump = tax_config.bump,
        constraint = tax_config.authority == authority.key()
    )]
    pub tax_config: Account<'info, TaxConfig>,
    
    /// CHECK: MIKO token mint
    pub miko_token_mint: AccountInfo<'info>,
    
    /// Vault PDA token account for holding fees
    #[account(
        init,
        payer = authority,
        seeds = [VAULT_SEED, miko_token_mint.key().as_ref()],
        bump,
        token::mint = miko_token_mint,
        token::authority = vault_account,
        token::token_program = token_2022_program,
    )]
    pub vault_account: Account<'info, TokenAccount>,
    
    pub system_program: Program<'info, System>,
    pub token_2022_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<InitializeVault>) -> Result<()> {
    msg!("Vault token account initialized");
    Ok(())
}