use anchor_lang::prelude::*;
use crate::{
    constants::*,
    errors::VaultError,
    state::{TaxConfig, RewardExclusions, TaxExemptions},
};

#[derive(Accounts)]
pub struct InitializeExclusions<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        seeds = [TAX_CONFIG_SEED],
        bump = tax_config.bump,
        constraint = tax_config.initialized @ VaultError::NotInitialized,
        constraint = tax_config.authority == authority.key() @ VaultError::UnauthorizedAccess
    )]
    pub tax_config: Account<'info, TaxConfig>,
    
    #[account(
        init,
        payer = authority,
        space = RewardExclusions::LEN,
        seeds = [b"reward_exclusions"],
        bump
    )]
    pub reward_exclusions: Account<'info, RewardExclusions>,
    
    #[account(
        init,
        payer = authority,
        space = TaxExemptions::LEN,
        seeds = [b"tax_exemptions"],
        bump
    )]
    pub tax_exemptions: Account<'info, TaxExemptions>,
    
    pub system_program: Program<'info, System>,
}

pub fn initialize_exclusions(
    ctx: Context<InitializeExclusions>,
    initial_reward_exclusions: Vec<Pubkey>,
    initial_tax_exemptions: Vec<Pubkey>,
) -> Result<()> {
    // Initialize reward exclusions
    let reward_exclusions = &mut ctx.accounts.reward_exclusions;
    reward_exclusions.authority = ctx.accounts.authority.key();
    reward_exclusions.excluded_addresses = initial_reward_exclusions;
    reward_exclusions.bump = ctx.bumps.reward_exclusions;
    
    // Initialize tax exemptions
    let tax_exemptions = &mut ctx.accounts.tax_exemptions;
    tax_exemptions.authority = ctx.accounts.authority.key();
    tax_exemptions.exempt_addresses = initial_tax_exemptions;
    tax_exemptions.bump = ctx.bumps.tax_exemptions;
    
    msg!("Initialized exclusions with {} reward exclusions and {} tax exemptions", 
         reward_exclusions.excluded_addresses.len(),
         tax_exemptions.exempt_addresses.len());
    
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateRewardExclusions<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"reward_exclusions"],
        bump = reward_exclusions.bump,
        constraint = reward_exclusions.authority == authority.key() @ VaultError::UnauthorizedAccess
    )]
    pub reward_exclusions: Account<'info, RewardExclusions>,
}

pub fn add_reward_exclusion(
    ctx: Context<UpdateRewardExclusions>,
    address: Pubkey,
) -> Result<()> {
    let exclusions = &mut ctx.accounts.reward_exclusions;
    
    require!(
        !exclusions.excluded_addresses.contains(&address),
        VaultError::AlreadyExcluded
    );
    
    exclusions.excluded_addresses.push(address);
    
    msg!("Added {} to reward exclusions", address);
    
    Ok(())
}

pub fn remove_reward_exclusion(
    ctx: Context<UpdateRewardExclusions>,
    address: Pubkey,
) -> Result<()> {
    let exclusions = &mut ctx.accounts.reward_exclusions;
    
    let pos = exclusions.excluded_addresses.iter()
        .position(|&x| x == address)
        .ok_or(VaultError::NotExcluded)?;
    
    exclusions.excluded_addresses.remove(pos);
    
    msg!("Removed {} from reward exclusions", address);
    
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateTaxExemptions<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"tax_exemptions"],
        bump = tax_exemptions.bump,
        constraint = tax_exemptions.authority == authority.key() @ VaultError::UnauthorizedAccess
    )]
    pub tax_exemptions: Account<'info, TaxExemptions>,
}

pub fn add_tax_exemption(
    ctx: Context<UpdateTaxExemptions>,
    address: Pubkey,
) -> Result<()> {
    let exemptions = &mut ctx.accounts.tax_exemptions;
    
    require!(
        !exemptions.exempt_addresses.contains(&address),
        VaultError::AlreadyExempt
    );
    
    exemptions.exempt_addresses.push(address);
    
    msg!("Added {} to tax exemptions", address);
    
    Ok(())
}

pub fn remove_tax_exemption(
    ctx: Context<UpdateTaxExemptions>,
    address: Pubkey,
) -> Result<()> {
    let exemptions = &mut ctx.accounts.tax_exemptions;
    
    let pos = exemptions.exempt_addresses.iter()
        .position(|&x| x == address)
        .ok_or(VaultError::NotExempt)?;
    
    exemptions.exempt_addresses.remove(pos);
    
    msg!("Removed {} from tax exemptions", address);
    
    Ok(())
}