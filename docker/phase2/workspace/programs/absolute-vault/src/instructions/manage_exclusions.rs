use anchor_lang::prelude::*;
use crate::state::*;
use crate::constants::*;
use crate::errors::*;

#[derive(Accounts)]
pub struct ManageExclusions<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.token_mint.as_ref()],
        bump = vault.bump,
        has_one = authority,
    )]
    pub vault: Account<'info, VaultState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn handler(
    ctx: Context<ManageExclusions>,
    wallet: Pubkey,
    exclusion_type: u8,
    action: bool, // true = add, false = remove
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    
    // Validate exclusion type
    require!(
        exclusion_type == EXCLUSION_FEE || 
        exclusion_type == EXCLUSION_REWARD || 
        exclusion_type == EXCLUSION_BOTH,
        VaultError::InvalidExclusionType
    );
    
    match (exclusion_type, action) {
        (EXCLUSION_FEE, true) => {
            vault.add_fee_exclusion(wallet)?;
            msg!("Added {} to fee exclusion list", wallet);
        },
        (EXCLUSION_FEE, false) => {
            vault.remove_fee_exclusion(&wallet)?;
            msg!("Removed {} from fee exclusion list", wallet);
        },
        (EXCLUSION_REWARD, true) => {
            vault.add_reward_exclusion(wallet)?;
            msg!("Added {} to reward exclusion list", wallet);
        },
        (EXCLUSION_REWARD, false) => {
            vault.remove_reward_exclusion(&wallet)?;
            msg!("Removed {} from reward exclusion list", wallet);
        },
        (EXCLUSION_BOTH, true) => {
            vault.add_fee_exclusion(wallet)?;
            vault.add_reward_exclusion(wallet)?;
            msg!("Added {} to both exclusion lists", wallet);
        },
        (EXCLUSION_BOTH, false) => {
            vault.remove_fee_exclusion(&wallet)?;
            vault.remove_reward_exclusion(&wallet)?;
            msg!("Removed {} from both exclusion lists", wallet);
        },
        _ => return Err(VaultError::InvalidExclusionType.into()),
    }
    
    Ok(())
}
