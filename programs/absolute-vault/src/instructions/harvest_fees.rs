use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token::{Token, TokenAccount, Mint};
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
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        associated_token::mint = tax_config.miko_token_mint,
        associated_token::authority = tax_config.treasury_wallet,
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: Fee authority PDA
    #[account(
        seeds = [FEE_AUTHORITY_SEED],
        bump
    )]
    pub fee_authority: UncheckedAccount<'info>,
    
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
    let fee_seeds = &[FEE_AUTHORITY_SEED, &[ctx.bumps.fee_authority]];
    let fee_signer = &[&fee_seeds[..]];
    
    if !source_accounts.is_empty() {
        let harvest_ix = spl_token_2022::instruction::harvest_withheld_tokens_to_mint(
            &ctx.accounts.token_2022_program.key(),
            &ctx.accounts.miko_token_mint.key(),
            &source_accounts,
        )?;
        
        anchor_lang::solana_program::program::invoke_signed(
            &harvest_ix,
            &[
                ctx.accounts.miko_token_mint.to_account_info(),
                ctx.accounts.fee_authority.to_account_info(),
            ],
            fee_signer,
        )?;
        
        msg!("Harvested fees from {} accounts", source_accounts.len());
    }
    
    // Step 2: Get total withheld amount from mint
    let mint_info = ctx.accounts.miko_token_mint.to_account_info();
    let mint_data = mint_info.data.borrow();
    
    // Parse mint to get withheld amount
    // This is a simplified version - in production you'd properly deserialize the mint
    let withheld_amount = u64::from_le_bytes(
        mint_data[mint_data.len() - 8..].try_into().unwrap_or([0; 8])
    );
    
    if withheld_amount == 0 {
        return err!(VaultError::NoFeesToCollect);
    }
    
    // Step 3: Calculate distribution (1% owner, 4% treasury)
    let owner_amount = withheld_amount
        .checked_mul(OWNER_SHARE_BASIS_POINTS as u64)
        .ok_or(VaultError::MathOverflow)?
        .checked_div(TAX_RATE_BASIS_POINTS as u64)
        .ok_or(VaultError::MathOverflow)?;
    
    let treasury_amount = withheld_amount
        .checked_sub(owner_amount)
        .ok_or(VaultError::MathOverflow)?;
    
    // Step 4: Withdraw to owner
    let withdraw_seeds = &[WITHDRAW_AUTHORITY_SEED, &[ctx.bumps.withdraw_authority]];
    let withdraw_signer = &[&withdraw_seeds[..]];
    
    let withdraw_owner_ix = spl_token_2022::instruction::withdraw_withheld_tokens_from_mint(
        &ctx.accounts.token_2022_program.key(),
        &ctx.accounts.miko_token_mint.key(),
        &ctx.accounts.owner_token_account.key(),
        &ctx.accounts.withdraw_authority.key(),
        &[],
        owner_amount,
    )?;
    
    anchor_lang::solana_program::program::invoke_signed(
        &withdraw_owner_ix,
        &[
            ctx.accounts.miko_token_mint.to_account_info(),
            ctx.accounts.owner_token_account.to_account_info(),
            ctx.accounts.withdraw_authority.to_account_info(),
        ],
        withdraw_signer,
    )?;
    
    // Step 5: Withdraw to treasury
    let withdraw_treasury_ix = spl_token_2022::instruction::withdraw_withheld_tokens_from_mint(
        &ctx.accounts.token_2022_program.key(),
        &ctx.accounts.miko_token_mint.key(),
        &ctx.accounts.treasury_token_account.key(),
        &ctx.accounts.withdraw_authority.key(),
        &[],
        treasury_amount,
    )?;
    
    anchor_lang::solana_program::program::invoke_signed(
        &withdraw_treasury_ix,
        &[
            ctx.accounts.miko_token_mint.to_account_info(),
            ctx.accounts.treasury_token_account.to_account_info(),
            ctx.accounts.withdraw_authority.to_account_info(),
        ],
        withdraw_signer,
    )?;
    
    // Update total fees collected
    ctx.accounts.tax_config.total_fees_collected = ctx.accounts.tax_config.total_fees_collected
        .checked_add(withheld_amount)
        .ok_or(VaultError::MathOverflow)?;
    
    msg!("Fees collected and distributed:");
    msg!("  Total: {} MIKO", withheld_amount);
    msg!("  Owner (1%): {} MIKO", owner_amount);
    msg!("  Treasury (4%): {} MIKO", treasury_amount);
    
    Ok(())
}