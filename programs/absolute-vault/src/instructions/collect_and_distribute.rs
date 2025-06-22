use anchor_lang::prelude::*;
use anchor_spl::{
    token::{self, Token, TokenAccount, Mint, Transfer},
    associated_token::AssociatedToken,
};
use crate::{constants::*, errors::VaultError, state::TaxConfig};

#[derive(Accounts)]
pub struct CollectAndDistribute<'info> {
    #[account(mut)]
    pub keeper_bot: Signer<'info>,
    
    #[account(
        seeds = [TAX_CONFIG_SEED],
        bump = tax_config.bump,
        constraint = tax_config.initialized @ VaultError::NotInitialized,
        constraint = tax_config.keeper_bot_wallet == keeper_bot.key() @ VaultError::UnauthorizedAccess
    )]
    pub tax_config: Account<'info, TaxConfig>,
    
    pub token_mint: Account<'info, Mint>,
    
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = tax_holding_pda,
    )]
    pub tax_holding_account: Account<'info, TokenAccount>,
    
    /// CHECK: Tax holding PDA
    #[account(
        seeds = [TAX_HOLDING_SEED],
        bump
    )]
    pub tax_holding_pda: UncheckedAccount<'info>,
    
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = owner_wallet,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: Owner wallet
    pub owner_wallet: UncheckedAccount<'info>,
    
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = treasury_wallet,
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: Treasury wallet from Smart Dial
    pub treasury_wallet: UncheckedAccount<'info>,
    
    /// CHECK: Smart Dial program for validation
    pub smart_dial_program: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CollectAndDistribute>) -> Result<()> {
    let tax_config = &ctx.accounts.tax_config;
    
    // Validate smart dial program
    require!(
        ctx.accounts.smart_dial_program.key() == tax_config.smart_dial_program,
        VaultError::UnauthorizedAccess
    );
    
    // TODO: Add CPI call to Smart Dial to validate treasury wallet
    
    let total_tax = ctx.accounts.tax_holding_account.amount;
    
    if total_tax == 0 {
        msg!("No taxes to distribute");
        return Ok(());
    }
    
    // Calculate split: 1% to owner, 4% to treasury
    let owner_share = total_tax
        .checked_mul(OWNER_SHARE_BASIS_POINTS as u64)
        .ok_or(VaultError::MathOverflow)?
        .checked_div((TAX_RATE as u64) * 100)
        .ok_or(VaultError::MathOverflow)?;
    
    let treasury_share = total_tax
        .checked_sub(owner_share)
        .ok_or(VaultError::MathOverflow)?;
    
    let seeds = &[TAX_HOLDING_SEED, &[ctx.bumps.tax_holding_pda]];
    let signer = &[&seeds[..]];
    
    // Transfer to owner (1% of original amount = 20% of tax)
    if owner_share > 0 {
        let cpi_accounts = Transfer {
            from: ctx.accounts.tax_holding_account.to_account_info(),
            to: ctx.accounts.owner_token_account.to_account_info(),
            authority: ctx.accounts.tax_holding_pda.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        
        token::transfer(cpi_ctx, owner_share)?;
    }
    
    // Transfer to treasury (4% of original amount = 80% of tax)
    if treasury_share > 0 {
        let cpi_accounts = Transfer {
            from: ctx.accounts.tax_holding_account.to_account_info(),
            to: ctx.accounts.treasury_token_account.to_account_info(),
            authority: ctx.accounts.tax_holding_pda.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        
        token::transfer(cpi_ctx, treasury_share)?;
    }
    
    msg!("Tax distribution complete:");
    msg!("  Total tax collected: {} MIKO", total_tax);
    msg!("  Owner share (1%): {} MIKO", owner_share);
    msg!("  Treasury share (4%): {} MIKO", treasury_share);
    
    Ok(())
}