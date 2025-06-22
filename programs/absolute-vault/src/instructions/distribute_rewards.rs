use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use crate::{constants::*, errors::VaultError, state::{TaxConfig, HolderRegistry}};

#[derive(Accounts)]
pub struct DistributeRewards<'info> {
    #[account(mut)]
    pub keeper_bot: Signer<'info>,
    
    #[account(
        seeds = [TAX_CONFIG_SEED],
        bump = tax_config.bump,
        constraint = tax_config.keeper_bot_wallet == keeper_bot.key() @ VaultError::UnauthorizedAccess
    )]
    pub tax_config: Account<'info, TaxConfig>,
    
    #[account(
        seeds = [HOLDER_REGISTRY_SEED],
        bump
    )]
    pub holder_registry: Account<'info, HolderRegistry>,
    
    /// CHECK: Treasury wallet that holds rewards
    #[account(
        mut,
        constraint = treasury_wallet.key() == tax_config.treasury_wallet
    )]
    pub treasury_wallet: Signer<'info>,
    
    #[account(
        mut,
        token::mint = reward_token_mint,
        token::authority = treasury_wallet,
    )]
    pub treasury_reward_account: Account<'info, TokenAccount>,
    
    pub reward_token_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<DistributeRewards>,
    _reward_token_mint: Pubkey,
) -> Result<()> {
    let registry = &ctx.accounts.holder_registry;
    let treasury_balance = ctx.accounts.treasury_reward_account.amount;
    
    if treasury_balance == 0 || registry.total_eligible == 0 {
        msg!("No rewards to distribute");
        return Ok(());
    }
    
    msg!("Starting reward distribution:");
    msg!("  Total rewards: {}", treasury_balance);
    msg!("  Eligible holders: {}", registry.holders.len());
    msg!("  Total eligible balance: {}", registry.total_eligible);
    
    // Note: In production, this would iterate through holders and distribute
    // For now, we just log the intent
    // Actual distribution would require remaining accounts for each holder
    
    Ok(())
}