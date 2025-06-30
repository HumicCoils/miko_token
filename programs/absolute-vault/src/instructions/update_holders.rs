use anchor_lang::prelude::*;
use crate::{constants::*, errors::VaultError, state::{TaxConfig, HolderRegistry}};

#[derive(Accounts)]
pub struct UpdateHolderRegistry<'info> {
    #[account(mut)]
    pub keeper_bot: Signer<'info>,
    
    #[account(
        seeds = [TAX_CONFIG_SEED],
        bump = tax_config.bump,
        constraint = tax_config.keeper_bot_wallet == keeper_bot.key() @ VaultError::UnauthorizedAccess
    )]
    pub tax_config: Account<'info, TaxConfig>,
    
    #[account(
        mut,
        seeds = [HOLDER_REGISTRY_SEED],
        bump
    )]
    pub holder_registry: Account<'info, HolderRegistry>,
}

pub fn handler(
    ctx: Context<UpdateHolderRegistry>,
    holders: Vec<Pubkey>,
    balances: Vec<u64>,
) -> Result<()> {
    require!(
        holders.len() == balances.len(),
        VaultError::InvalidHolderData
    );
    
    require!(
        holders.len() <= MAX_HOLDERS_PER_REGISTRY,
        VaultError::HolderRegistryFull
    );
    
    let registry = &mut ctx.accounts.holder_registry;
    
    // Update registry
    registry.holders = holders;
    registry.balances = balances;
    registry.last_update = Clock::get()?.unix_timestamp;
    registry.total_eligible = registry.balances.iter().sum();
    
    msg!("Updated holder registry with {} holders", registry.holders.len());
    msg!("Total eligible balance: {}", registry.total_eligible);
    
    Ok(())
}