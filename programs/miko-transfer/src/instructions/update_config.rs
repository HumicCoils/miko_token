use anchor_lang::prelude::*;
use crate::{errors::TransferError, state::TransferConfig, constants::*};

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.initialized @ TransferError::NotInitialized,
        constraint = config.authority == authority.key() @ TransferError::UnauthorizedAccess
    )]
    pub config: Account<'info, TransferConfig>,
}

pub fn handler(
    ctx: Context<UpdateConfig>,
    new_absolute_vault_program: Option<Pubkey>,
    new_tax_holding_account: Option<Pubkey>,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    
    if let Some(program) = new_absolute_vault_program {
        config.absolute_vault_program = program;
        msg!("Updated Absolute Vault program: {}", program);
    }
    
    if let Some(account) = new_tax_holding_account {
        config.tax_holding_account = account;
        msg!("Updated tax holding account: {}", account);
    }
    
    Ok(())
}