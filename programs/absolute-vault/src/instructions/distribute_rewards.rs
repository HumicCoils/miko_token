use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::Token2022,
    token_interface::{Mint, TokenAccount, TokenInterface},
    token::{Token, TokenAccount as TokenAccountSpl},
};

use crate::{
    constants::*,
    errors::VaultError,
    state::{VaultState, ExclusionEntry, HolderData},
};

#[derive(Accounts)]
pub struct DistributeRewards<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault_state.bump
    )]
    pub vault_state: Account<'info, VaultState>,
    
    #[account(
        mut,
        constraint = keeper.key() == vault_state.keeper_wallet @ VaultError::InvalidAuthority
    )]
    pub keeper: Signer<'info>,
    
    /// CHECK: Reward token mint (could be any SPL token)
    #[account(
        constraint = reward_token_mint.key() == vault_state.reward_token_mint @ VaultError::InvalidRewardToken
    )]
    pub reward_token_mint: AccountInfo<'info>,
    
    /// Vault's reward token account (source of rewards)
    /// CHECK: This account is validated based on the reward token type
    #[account(mut)]
    pub vault_reward_account: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
    pub token_2022_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<DistributeRewards>,
    holder_data: Vec<HolderData>,
) -> Result<()> {
    let vault_state = &mut ctx.accounts.vault_state;
    let clock = Clock::get()?;
    
    require!(
        holder_data.len() <= MAX_HOLDERS_PER_DISTRIBUTION,
        VaultError::TooManyAccounts
    );
    
    msg!("Starting reward distribution to {} holders", holder_data.len());
    
    // Calculate total eligible balance
    let mut total_eligible_balance = 0u64;
    let mut eligible_holders = Vec::new();
    
    for holder in holder_data.iter() {
        // Check minimum USD value requirement
        if holder.usd_value < vault_state.min_hold_amount {
            msg!("Holder {} below minimum: ${} < ${}", 
                holder.wallet, holder.usd_value, vault_state.min_hold_amount);
            continue;
        }
        
        // Check if holder is excluded from rewards
        let exclusion_pda = Pubkey::find_program_address(
            &[EXCLUSION_SEED, holder.wallet.as_ref()],
            &crate::ID
        ).0;
        
        // Try to find exclusion in remaining accounts
        let is_excluded = ctx.remaining_accounts.iter()
            .find(|acc| acc.key() == exclusion_pda)
            .and_then(|acc| acc.try_borrow_data().ok())
            .map(|data| {
                if data.len() >= 8 + 32 + 1 {
                    // Check exclusion type (at offset 8 + 32)
                    let exclusion_type = data[40];
                    // RewardOnly = 1, Both = 2
                    exclusion_type == 1 || exclusion_type == 2
                } else {
                    false
                }
            })
            .unwrap_or(false);
            
        if is_excluded {
            msg!("Holder {} is excluded from rewards", holder.wallet);
            continue;
        }
        
        total_eligible_balance = total_eligible_balance
            .saturating_add(holder.balance);
        eligible_holders.push(holder);
    }
    
    if eligible_holders.is_empty() {
        msg!("No eligible holders found");
        return Ok(());
    }
    
    msg!("Found {} eligible holders with total balance: {}", 
        eligible_holders.len(), total_eligible_balance);
    
    // Get vault's reward token balance
    let vault_balance = get_token_balance(&ctx.accounts.vault_reward_account)?;
    
    if vault_balance == 0 {
        msg!("No rewards to distribute");
        return Ok(());
    }
    
    msg!("Distributing {} reward tokens", vault_balance);
    
    // Distribute proportionally
    let mut total_distributed = 0u64;
    let mut recipients = 0u32;
    
    for (idx, holder) in eligible_holders.iter().enumerate() {
        // Calculate holder's share
        let share = calculate_reward_share(
            holder.balance,
            total_eligible_balance,
            vault_balance
        )?;
        
        if share == 0 {
            continue;
        }
        
        // Find holder's reward token account in remaining accounts
        let holder_reward_account = ctx.remaining_accounts
            .get(idx)
            .ok_or(VaultError::InvalidHolderData)?;
            
        // Transfer rewards
        let seeds = &[VAULT_SEED, &[vault_state.bump]];
        let signer_seeds = &[&seeds[..]];
        
        // Determine which token program to use based on reward token
        let is_token_2022 = is_token_2022_mint(&ctx.accounts.reward_token_mint)?;
        
        if is_token_2022 {
            // Token-2022 transfer
            anchor_spl::token_2022::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_2022_program.to_account_info(),
                    anchor_spl::token_2022::Transfer {
                        from: ctx.accounts.vault_reward_account.to_account_info(),
                        to: holder_reward_account.to_account_info(),
                        authority: vault_state.to_account_info(),
                    },
                    signer_seeds
                ),
                share,
            )?;
        } else {
            // Regular SPL token transfer
            anchor_spl::token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token::Transfer {
                        from: ctx.accounts.vault_reward_account.to_account_info(),
                        to: holder_reward_account.to_account_info(),
                        authority: vault_state.to_account_info(),
                    },
                    signer_seeds
                ),
                share,
            )?;
        }
        
        total_distributed = total_distributed.saturating_add(share);
        recipients += 1;
        
        msg!("Distributed {} to {}", share, holder.wallet);
    }
    
    // Update vault state
    vault_state.total_rewards_distributed = vault_state.total_rewards_distributed
        .saturating_add(total_distributed);
    vault_state.last_distribution_timestamp = clock.unix_timestamp;
    vault_state.unique_reward_recipients = vault_state.unique_reward_recipients
        .saturating_add(recipients as u64);
    
    msg!("Distribution complete: {} tokens to {} recipients", 
        total_distributed, recipients);
    
    Ok(())
}

fn calculate_reward_share(
    holder_balance: u64,
    total_balance: u64,
    total_rewards: u64,
) -> Result<u64> {
    if total_balance == 0 {
        return Ok(0);
    }
    
    // Calculate share: (holder_balance * total_rewards) / total_balance
    let share = (holder_balance as u128)
        .checked_mul(total_rewards as u128)
        .ok_or(VaultError::ArithmeticOverflow)?
        .checked_div(total_balance as u128)
        .ok_or(VaultError::ArithmeticOverflow)?;
        
    Ok(share as u64)
}

fn get_token_balance(account: &AccountInfo) -> Result<u64> {
    let data = account.try_borrow_data()?;
    if data.len() < 72 {
        return Ok(0);
    }
    
    // Read amount field (offset 64, 8 bytes)
    let amount_bytes: [u8; 8] = data[64..72].try_into()
        .map_err(|_| VaultError::InvalidHolderData)?;
    let amount = u64::from_le_bytes(amount_bytes);
    
    Ok(amount)
}

fn is_token_2022_mint(mint: &AccountInfo) -> Result<bool> {
    // Check if the mint account owner is Token-2022 program
    Ok(mint.owner == &spl_token_2022::ID)
}