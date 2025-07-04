use anchor_lang::prelude::*;

use crate::{
    constants::*,
    errors::VaultError,
    state::VaultState,
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateConfigParams {
    pub new_treasury: Option<Pubkey>,
    pub new_owner_wallet: Option<Pubkey>,
    pub new_keeper_wallet: Option<Pubkey>,
    pub new_min_hold_amount: Option<u64>,
    pub new_reward_token_mint: Option<Pubkey>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault_state.bump
    )]
    pub vault_state: Account<'info, VaultState>,
    
    #[account(
        constraint = authority.key() == vault_state.authority @ VaultError::InvalidAuthority
    )]
    pub authority: Signer<'info>,
}

pub fn handler(
    ctx: Context<UpdateConfig>,
    params: UpdateConfigParams,
) -> Result<()> {
    let vault_state = &mut ctx.accounts.vault_state;
    
    msg!("Updating vault configuration");
    
    // Update treasury if provided
    if let Some(new_treasury) = params.new_treasury {
        msg!("Updating treasury: {} -> {}", vault_state.treasury, new_treasury);
        vault_state.treasury = new_treasury;
    }
    
    // Update owner wallet if provided
    if let Some(new_owner_wallet) = params.new_owner_wallet {
        msg!("Updating owner wallet: {} -> {}", vault_state.owner_wallet, new_owner_wallet);
        vault_state.owner_wallet = new_owner_wallet;
    }
    
    // Update keeper wallet if provided
    if let Some(new_keeper_wallet) = params.new_keeper_wallet {
        msg!("Updating keeper wallet: {} -> {}", vault_state.keeper_wallet, new_keeper_wallet);
        vault_state.keeper_wallet = new_keeper_wallet;
    }
    
    // Update minimum hold amount if provided
    if let Some(new_min_hold_amount) = params.new_min_hold_amount {
        msg!("Updating min hold amount: ${} -> ${}", 
            vault_state.min_hold_amount, new_min_hold_amount);
        vault_state.min_hold_amount = new_min_hold_amount;
    }
    
    // Update reward token mint if provided
    if let Some(new_reward_token_mint) = params.new_reward_token_mint {
        msg!("Updating reward token mint: {} -> {}", 
            vault_state.reward_token_mint, new_reward_token_mint);
        vault_state.reward_token_mint = new_reward_token_mint;
    }
    
    msg!("Configuration update complete");
    
    Ok(())
}

// Separate instruction to update authority (requires current authority)
#[derive(Accounts)]
pub struct UpdateAuthority<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault_state.bump
    )]
    pub vault_state: Account<'info, VaultState>,
    
    #[account(
        constraint = current_authority.key() == vault_state.authority @ VaultError::InvalidAuthority
    )]
    pub current_authority: Signer<'info>,
    
    /// CHECK: New authority to set
    pub new_authority: AccountInfo<'info>,
}

pub fn update_authority(ctx: Context<UpdateAuthority>) -> Result<()> {
    let vault_state = &mut ctx.accounts.vault_state;
    let new_authority = ctx.accounts.new_authority.key();
    
    msg!("Updating authority: {} -> {}", vault_state.authority, new_authority);
    
    vault_state.authority = new_authority;
    
    msg!("Authority update complete");
    
    Ok(())
}