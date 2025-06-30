use anchor_lang::prelude::*;
use crate::{constants::*, state::{TaxConfig, HolderRegistry}};

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(mut)]
    pub keeper_bot: Signer<'info>,
    
    #[account(
        seeds = [TAX_CONFIG_SEED],
        bump = tax_config.bump,
        constraint = tax_config.keeper_bot_wallet == keeper_bot.key()
    )]
    pub tax_config: Account<'info, TaxConfig>,
    
    #[account(
        init,
        payer = keeper_bot,
        space = HolderRegistry::LEN,
        seeds = [HOLDER_REGISTRY_SEED],
        bump
    )]
    pub holder_registry: Account<'info, HolderRegistry>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeRegistry>) -> Result<()> {
    let registry = &mut ctx.accounts.holder_registry;
    
    registry.holders = Vec::new();
    registry.balances = Vec::new();
    registry.last_update = Clock::get()?.unix_timestamp;
    registry.total_eligible = 0;
    
    msg!("Holder registry initialized");
    
    Ok(())
}