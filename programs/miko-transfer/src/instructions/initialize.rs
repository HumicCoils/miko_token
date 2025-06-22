use anchor_lang::prelude::*;
use crate::{constants::*, state::TransferConfig};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = TransferConfig::LEN,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, TransferConfig>,
    
    /// CHECK: Tax holding account from Absolute Vault
    pub tax_holding_account: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    miko_token_mint: Pubkey,
    absolute_vault_program: Pubkey,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    
    config.authority = ctx.accounts.authority.key();
    config.miko_token_mint = miko_token_mint;
    config.absolute_vault_program = absolute_vault_program;
    config.tax_holding_account = ctx.accounts.tax_holding_account.key();
    config.initialized = true;
    config.bump = ctx.bumps.config;
    
    msg!("MIKO Transfer wrapper initialized");
    msg!("Tax rate: {}%", TAX_RATE as f64 / 100.0);
    msg!("Tax holding account: {}", config.tax_holding_account);
    
    Ok(())
}