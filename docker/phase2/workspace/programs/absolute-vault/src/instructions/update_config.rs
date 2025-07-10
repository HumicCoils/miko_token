use anchor_lang::prelude::*;
use crate::state::*;
use crate::constants::*;
use crate::errors::*;

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.token_mint.as_ref()],
        bump = vault.bump,
        has_one = authority,
    )]
    pub vault: Account<'info, VaultState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: New treasury wallet (validated if Some)
    pub new_treasury: Option<AccountInfo<'info>>,
    
    /// CHECK: New owner wallet (validated if Some)
    pub new_owner_wallet: Option<AccountInfo<'info>>,
}

pub fn handler(
    ctx: Context<UpdateConfig>,
    new_min_hold_amount: Option<u64>,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    
    // Update min hold amount if provided
    if let Some(min_amount) = new_min_hold_amount {
        require!(min_amount > 0, VaultError::MinHoldAmountTooLow);
        vault.min_hold_amount = min_amount;
        msg!("Updated min hold amount to: {}", min_amount);
    }
    
    // Update treasury if provided
    if let Some(treasury) = &ctx.accounts.new_treasury {
        vault.treasury = treasury.key();
        msg!("Updated treasury to: {}", treasury.key());
    }
    
    // Update owner wallet if provided
    if let Some(owner) = &ctx.accounts.new_owner_wallet {
        vault.owner_wallet = owner.key();
        msg!("Updated owner wallet to: {}", owner.key());
    }
    
    Ok(())
}
