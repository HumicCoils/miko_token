use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use crate::{constants::*, errors::TransferError, state::TransferConfig};

#[derive(Accounts)]
pub struct TransferWithTax<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,
    
    /// CHECK: Recipient of the transfer
    pub recipient: UncheckedAccount<'info>,
    
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.initialized @ TransferError::NotInitialized
    )]
    pub config: Account<'info, TransferConfig>,
    
    #[account(
        constraint = token_mint.key() == config.miko_token_mint @ TransferError::InvalidTokenMint
    )]
    pub token_mint: Account<'info, Mint>,
    
    #[account(
        mut,
        constraint = sender_token_account.owner == sender.key(),
        constraint = sender_token_account.mint == token_mint.key()
    )]
    pub sender_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = recipient_token_account.owner == recipient.key(),
        constraint = recipient_token_account.mint == token_mint.key()
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = tax_holding_token_account.owner == config.tax_holding_account,
        constraint = tax_holding_token_account.mint == token_mint.key()
    )]
    pub tax_holding_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: Absolute Vault program for checking exemptions
    #[account(
        constraint = absolute_vault_program.key() == config.absolute_vault_program
    )]
    pub absolute_vault_program: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<TransferWithTax>, amount: u64) -> Result<()> {
    // Check if sender is tax exempt (CPI to Absolute Vault)
    let is_exempt = check_tax_exemption(
        &ctx.accounts.sender.key(),
        &ctx.accounts.absolute_vault_program,
    )?;
    
    // Calculate tax
    let tax_amount = if is_exempt {
        0
    } else {
        amount
            .checked_mul(TAX_RATE as u64)
            .ok_or(TransferError::TaxCalculationOverflow)?
            .checked_div(BASIS_POINTS as u64)
            .ok_or(TransferError::TaxCalculationOverflow)?
    };
    
    let transfer_amount = amount
        .checked_sub(tax_amount)
        .ok_or(TransferError::InsufficientBalance)?;
    
    // Check sender has enough balance
    require!(
        ctx.accounts.sender_token_account.amount >= amount,
        TransferError::InsufficientBalance
    );
    
    // Transfer to recipient (net amount)
    if transfer_amount > 0 {
        let cpi_accounts = Transfer {
            from: ctx.accounts.sender_token_account.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: ctx.accounts.sender.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        token::transfer(cpi_ctx, transfer_amount)?;
    }
    
    // Transfer tax to holding account
    if tax_amount > 0 {
        let cpi_accounts = Transfer {
            from: ctx.accounts.sender_token_account.to_account_info(),
            to: ctx.accounts.tax_holding_token_account.to_account_info(),
            authority: ctx.accounts.sender.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        token::transfer(cpi_ctx, tax_amount)?;
    }
    
    msg!("Transfer completed: {} MIKO", amount);
    msg!("Tax collected: {} MIKO ({}%)", tax_amount, if is_exempt { 0 } else { 5 });
    msg!("Net transfer: {} MIKO", transfer_amount);
    
    Ok(())
}

pub fn handler_checked(
    ctx: Context<TransferWithTax>,
    amount: u64,
    decimals: u8,
) -> Result<()> {
    // Verify decimals match
    require!(
        ctx.accounts.token_mint.decimals == decimals,
        TransferError::InvalidDecimals
    );
    
    handler(ctx, amount)
}

// Helper function to check tax exemption via CPI
fn check_tax_exemption(
    sender: &Pubkey,
    _absolute_vault_program: &UncheckedAccount,
) -> Result<bool> {
    // For now, return false (not exempt) - CPI implementation requires
    // additional accounts that would need to be passed through
    // This can be implemented in a future update
    msg!("Tax exemption check for {}: false (CPI not implemented)", sender);
    Ok(false)
}