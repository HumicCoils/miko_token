use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, TransferChecked};
use anchor_spl::token::TokenAccount;
use spl_token_2022::{
    extension::transfer_fee,
};
use crate::{constants::*, errors::VaultError, state::TaxConfig};

#[derive(Accounts)]
pub struct HarvestAndCollectFees<'info> {
    #[account(mut)]
    pub keeper_bot: Signer<'info>,
    
    #[account(
        mut,
        seeds = [TAX_CONFIG_SEED],
        bump = tax_config.bump,
        constraint = tax_config.keeper_bot_wallet == keeper_bot.key() @ VaultError::UnauthorizedAccess
    )]
    pub tax_config: Account<'info, TaxConfig>,
    
    /// CHECK: MIKO token mint
    #[account(
        mut,
        constraint = miko_token_mint.key() == tax_config.miko_token_mint @ VaultError::InvalidTokenMint
    )]
    pub miko_token_mint: UncheckedAccount<'info>,
    
    #[account(
        mut,
        associated_token::mint = tax_config.miko_token_mint,
        associated_token::authority = tax_config.owner_wallet,
        associated_token::token_program = token_2022_program,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        associated_token::mint = tax_config.miko_token_mint,
        associated_token::authority = tax_config.treasury_wallet,
        associated_token::token_program = token_2022_program,
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,
    
    /// Vault PDA that receives fees before distribution
    #[account(
        mut,
        seeds = [VAULT_SEED, tax_config.miko_token_mint.as_ref()],
        bump,
        token::mint = tax_config.miko_token_mint,
        token::authority = vault_account,
        token::token_program = token_2022_program,
    )]
    pub vault_account: Account<'info, TokenAccount>,
    
    /// CHECK: Withdraw authority PDA
    #[account(
        seeds = [WITHDRAW_AUTHORITY_SEED],
        bump
    )]
    pub withdraw_authority: UncheckedAccount<'info>,
    
    pub token_2022_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<HarvestAndCollectFees>, source_accounts: Vec<Pubkey>) -> Result<()> {
    // Step 1: Harvest withheld fees from source accounts to mint
    if !source_accounts.is_empty() {
        let source_account_refs: Vec<&Pubkey> = source_accounts.iter().collect();
        let harvest_ix = transfer_fee::instruction::harvest_withheld_tokens_to_mint(
            &ctx.accounts.token_2022_program.key(),
            &ctx.accounts.miko_token_mint.key(),
            &source_account_refs,
        )?;
        
        anchor_lang::solana_program::program::invoke(
            &harvest_ix,
            &[
                ctx.accounts.miko_token_mint.to_account_info(),
            ],
        )?;
        
        msg!("Harvested fees from {} accounts", source_accounts.len());
    }
    
    // Step 2: Withdraw all fees from mint to vault PDA
    let withdraw_seeds = &[WITHDRAW_AUTHORITY_SEED, &[ctx.bumps.withdraw_authority]];
    let withdraw_signer = &[&withdraw_seeds[..]];
    
    let withdraw_ix = transfer_fee::instruction::withdraw_withheld_tokens_from_mint(
        &ctx.accounts.token_2022_program.key(),
        &ctx.accounts.miko_token_mint.key(),
        &ctx.accounts.vault_account.key(),
        &ctx.accounts.withdraw_authority.key(),
        &[],
    )?;
    
    anchor_lang::solana_program::program::invoke_signed(
        &withdraw_ix,
        &[
            ctx.accounts.miko_token_mint.to_account_info(),
            ctx.accounts.vault_account.to_account_info(),
            ctx.accounts.withdraw_authority.to_account_info(),
        ],
        withdraw_signer,
    )?;
    
    // Step 3: Get the vault balance to calculate distribution
    ctx.accounts.vault_account.reload()?;
    let total_fees = ctx.accounts.vault_account.amount;
    
    if total_fees == 0 {
        return Ok(()); // No fees to distribute
    }
    
    // Step 4: Calculate distribution (1% owner, 4% treasury)
    let owner_amount = total_fees
        .checked_mul(OWNER_SHARE_BASIS_POINTS as u64)
        .ok_or(VaultError::MathOverflow)?
        .checked_div(TAX_RATE_BASIS_POINTS as u64)
        .ok_or(VaultError::MathOverflow)?;
    
    let treasury_amount = total_fees
        .checked_sub(owner_amount)
        .ok_or(VaultError::MathOverflow)?;
    
    // Step 5: Transfer from vault to owner and treasury
    let vault_seeds = &[VAULT_SEED, ctx.accounts.tax_config.miko_token_mint.as_ref(), &[ctx.bumps.vault_account]];
    let vault_signer = &[&vault_seeds[..]];
    
    // Transfer to owner
    if owner_amount > 0 {
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault_account.to_account_info(),
            to: ctx.accounts.owner_token_account.to_account_info(),
            mint: ctx.accounts.miko_token_mint.to_account_info(),
            authority: ctx.accounts.vault_account.to_account_info(),
        };
        
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_2022_program.to_account_info(),
            cpi_accounts,
            vault_signer,
        );
        
        token_2022::transfer_checked(cpi_ctx, owner_amount, 9)?;
    }
    
    // Transfer to treasury
    if treasury_amount > 0 {
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault_account.to_account_info(),
            to: ctx.accounts.treasury_token_account.to_account_info(),
            mint: ctx.accounts.miko_token_mint.to_account_info(),
            authority: ctx.accounts.vault_account.to_account_info(),
        };
        
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_2022_program.to_account_info(),
            cpi_accounts,
            vault_signer,
        );
        
        token_2022::transfer_checked(cpi_ctx, treasury_amount, 9)?;
    }
    
    msg!("Distributed fees: {} to owner, {} to treasury", owner_amount, treasury_amount);
    
    Ok(())
}