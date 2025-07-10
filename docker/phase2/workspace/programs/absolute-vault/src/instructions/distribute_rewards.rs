use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_interface::{self, TokenAccount, Mint, TokenInterface};
use crate::state::*;
use crate::constants::*;
use crate::errors::*;

#[derive(Accounts)]
pub struct DistributeRewards<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.token_mint.as_ref()],
        bump = vault.bump,
        has_one = authority,
    )]
    pub vault: Account<'info, VaultState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: Keeper wallet that might need SOL top-up
    #[account(mut)]
    pub keeper_wallet: SystemAccount<'info>,
    
    /// CHECK: Owner wallet for receiving 1% share
    #[account(mut)]
    pub owner_wallet: SystemAccount<'info>,
    
    /// CHECK: Treasury wallet for receiving distribution
    #[account(mut)]
    pub treasury_wallet: SystemAccount<'info>,
    
    #[account(mut)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// CHECK: Holder wallet to receive rewards
    #[account(mut)]
    pub holder_wallet: AccountInfo<'info>,
    
    #[account(mut)]
    pub holder_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub reward_token_mint: InterfaceAccount<'info, Mint>,
    
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<DistributeRewards>,
    holder_balance: u64,
    total_eligible_balance: u64,
    reward_token_is_sol: bool,
) -> Result<()> {
    let vault = &ctx.accounts.vault;
    let clock = Clock::get()?;
    
    // Check if holder is excluded from rewards
    if vault.is_reward_excluded(&ctx.accounts.holder_wallet.key()) {
        msg!("Holder {} is excluded from rewards", ctx.accounts.holder_wallet.key());
        return Ok(());
    }
    
    // Validate holder eligibility (passed from off-chain)
    require!(holder_balance > 0, VaultError::InvalidHolderCount);
    require!(total_eligible_balance > 0, VaultError::NoEligibleHolders);
    
    let vault_seeds = &[
        VAULT_SEED,
        vault.token_mint.as_ref(),
        &[vault.bump],
    ];
    let signer = &[&vault_seeds[..]];
    
    // Calculate reward amount based on holder's proportion
    let vault_balance = ctx.accounts.vault_token_account.amount;
    let holder_share = vault_balance
        .checked_mul(holder_balance)
        .ok_or(VaultError::ArithmeticOverflow)?
        .checked_div(total_eligible_balance)
        .ok_or(VaultError::ArithmeticOverflow)?;
    
    if holder_share == 0 {
        return Ok(());
    }
    
    // Handle SOL distribution
    if reward_token_is_sol {
        let keeper_balance = ctx.accounts.keeper_wallet.lamports();
        
        // Check if keeper needs SOL top-up
        if keeper_balance < MIN_KEEPER_SOL_BALANCE {
            let top_up_amount = TARGET_KEEPER_SOL_BALANCE
                .checked_sub(keeper_balance)
                .ok_or(VaultError::ArithmeticOverflow)?;
            
            // Transfer SOL to keeper
            let transfer_ix = system_program::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.keeper_wallet.to_account_info(),
            };
            let transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                transfer_ix,
                signer,
            );
            system_program::transfer(transfer_ctx, top_up_amount)?;
            
            msg!("Topped up keeper wallet with {} lamports", top_up_amount);
        }
        
        // Transfer SOL reward to holder
        let transfer_ix = system_program::Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.holder_wallet.to_account_info(),
        };
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            transfer_ix,
            signer,
        );
        system_program::transfer(transfer_ctx, holder_share)?;
    } else {
        // Transfer token rewards
        let cpi_accounts = token_interface::Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.holder_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        
        token_interface::transfer(cpi_ctx, holder_share)?;
    }
    
    // Update distribution stats
    let vault = &mut ctx.accounts.vault;
    vault.total_rewards_distributed = vault.total_rewards_distributed
        .checked_add(holder_share)
        .ok_or(VaultError::ArithmeticOverflow)?;
    vault.last_distribution_timestamp = clock.unix_timestamp;
    
    msg!("Distributed {} reward tokens to holder {}", holder_share, ctx.accounts.holder_wallet.key());
    
    Ok(())
}
