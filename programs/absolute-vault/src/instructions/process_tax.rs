use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Token, TokenAccount, Mint},
    associated_token::AssociatedToken,
};
use crate::{constants::*, errors::VaultError, state::TaxConfig};

#[derive(Accounts)]
pub struct ProcessTax<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [TAX_CONFIG_SEED],
        bump = tax_config.bump,
        constraint = tax_config.initialized @ VaultError::NotInitialized
    )]
    pub tax_config: Account<'info, TaxConfig>,
    
    #[account(mut)]
    pub token_mint: Account<'info, Mint>,
    
    /// CHECK: Tax authority PDA
    #[account(
        seeds = [TAX_AUTHORITY_SEED],
        bump
    )]
    pub tax_authority_pda: UncheckedAccount<'info>,
    
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = tax_holding_pda,
    )]
    pub tax_holding_account: Account<'info, TokenAccount>,
    
    /// CHECK: Tax holding PDA
    #[account(
        seeds = [TAX_HOLDING_SEED],
        bump
    )]
    pub tax_holding_pda: UncheckedAccount<'info>,
    
    /// CHECK: Owner wallet from Smart Dial - validated via CPI
    #[account(mut)]
    pub owner_wallet: UncheckedAccount<'info>,
    
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = owner_wallet,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: Treasury wallet from Smart Dial - validated via CPI
    #[account(mut)]
    pub treasury_wallet: UncheckedAccount<'info>,
    
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = treasury_wallet,
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: Smart Dial program
    pub smart_dial_program: UncheckedAccount<'info>,
    
    /// CHECK: Token-2022 program
    pub token_program: UncheckedAccount<'info>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ProcessTax>) -> Result<()> {
    let tax_config = &ctx.accounts.tax_config;
    
    // Validate smart dial program
    require!(
        ctx.accounts.smart_dial_program.key() == tax_config.smart_dial_program,
        VaultError::UnauthorizedAccess
    );
    
    // TODO: Add CPI call to Smart Dial to validate owner and treasury wallets
    
    // TODO: Implement withdrawal of withheld tokens from Token-2022
    // For now, we assume tokens are already in the tax holding account
    
    let total_tax = ctx.accounts.tax_holding_account.amount;
    
    // Calculate splits
    let owner_amount = total_tax
        .checked_mul(OWNER_SHARE as u64).ok_or(VaultError::MathOverflow)?
        .checked_div(TAX_RATE as u64).ok_or(VaultError::MathOverflow)?;
    
    let treasury_amount = total_tax
        .checked_sub(owner_amount).ok_or(VaultError::MathOverflow)?;
    
    // Transfer to owner using CPI
    let seeds = &[TAX_HOLDING_SEED, &[ctx.bumps.tax_holding_pda]];
    let signer = &[&seeds[..]];
    
    // Transfer to owner
    anchor_lang::solana_program::program::invoke_signed(
        &spl_token_2022::instruction::transfer_checked(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.tax_holding_account.key(),
            &ctx.accounts.token_mint.key(),
            &ctx.accounts.owner_token_account.key(),
            &ctx.accounts.tax_holding_pda.key(),
            &[],
            owner_amount,
            ctx.accounts.token_mint.decimals,
        )?,
        &[
            ctx.accounts.tax_holding_account.to_account_info(),
            ctx.accounts.token_mint.to_account_info(),
            ctx.accounts.owner_token_account.to_account_info(),
            ctx.accounts.tax_holding_pda.to_account_info(),
        ],
        signer,
    )?;
    
    // Transfer to treasury
    anchor_lang::solana_program::program::invoke_signed(
        &spl_token_2022::instruction::transfer_checked(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.tax_holding_account.key(),
            &ctx.accounts.token_mint.key(),
            &ctx.accounts.treasury_token_account.key(),
            &ctx.accounts.tax_holding_pda.key(),
            &[],
            treasury_amount,
            ctx.accounts.token_mint.decimals,
        )?,
        &[
            ctx.accounts.tax_holding_account.to_account_info(),
            ctx.accounts.token_mint.to_account_info(),
            ctx.accounts.treasury_token_account.to_account_info(),
            ctx.accounts.tax_holding_pda.to_account_info(),
        ],
        signer,
    )?;
    
    msg!("Processed tax: {} total, {} to owner, {} to treasury", 
        total_tax, owner_amount, treasury_amount);
    
    Ok(())
}