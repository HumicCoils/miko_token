use anchor_lang::prelude::*;
use crate::{constants::*, errors::VaultError, state::{TaxConfig, ExclusionList, ExclusionType}};

#[derive(Accounts)]
pub struct ManageExclusions<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        seeds = [TAX_CONFIG_SEED],
        bump = tax_config.bump,
        constraint = tax_config.authority == authority.key() @ VaultError::UnauthorizedAccess
    )]
    pub tax_config: Account<'info, TaxConfig>,
    
    #[account(
        mut,
        seeds = [EXCLUSIONS_SEED],
        bump = exclusion_list.bump,
    )]
    pub exclusion_list: Account<'info, ExclusionList>,
}

pub fn add_exclusion(
    ctx: Context<ManageExclusions>,
    wallet: Pubkey,
    exclusion_type: ExclusionType,
) -> Result<()> {
    let exclusion_list = &mut ctx.accounts.exclusion_list;
    
    match exclusion_type {
        ExclusionType::RewardExclusion => {
            require!(
                !exclusion_list.reward_exclusions.contains(&wallet),
                VaultError::WalletAlreadyExcluded
            );
            exclusion_list.reward_exclusions.push(wallet);
            msg!("Added {} to reward exclusions", wallet);
        }
        ExclusionType::TaxExemption => {
            require!(
                !exclusion_list.tax_exemptions.contains(&wallet),
                VaultError::WalletAlreadyExcluded
            );
            exclusion_list.tax_exemptions.push(wallet);
            msg!("Added {} to tax exemptions", wallet);
        }
    }
    
    Ok(())
}

pub fn remove_exclusion(
    ctx: Context<ManageExclusions>,
    wallet: Pubkey,
    exclusion_type: ExclusionType,
) -> Result<()> {
    let exclusion_list = &mut ctx.accounts.exclusion_list;
    
    match exclusion_type {
        ExclusionType::RewardExclusion => {
            let pos = exclusion_list.reward_exclusions
                .iter()
                .position(|w| w == &wallet)
                .ok_or(VaultError::WalletNotExcluded)?;
            exclusion_list.reward_exclusions.remove(pos);
            msg!("Removed {} from reward exclusions", wallet);
        }
        ExclusionType::TaxExemption => {
            let pos = exclusion_list.tax_exemptions
                .iter()
                .position(|w| w == &wallet)
                .ok_or(VaultError::WalletNotExcluded)?;
            exclusion_list.tax_exemptions.remove(pos);
            msg!("Removed {} from tax exemptions", wallet);
        }
    }
    
    Ok(())
}