use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use spl_token_2022::instruction as token_instruction;
use anchor_spl::token_interface::{TokenAccount, Mint};
use crate::state::*;
use crate::constants::*;
use crate::errors::*;

#[derive(Accounts)]
pub struct HarvestFees<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.token_mint.as_ref()],
        bump = vault.bump,
        has_one = authority,
    )]
    pub vault: Account<'info, VaultState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: Token account to harvest from (validated in handler)
    #[account(mut)]
    pub token_account: AccountInfo<'info>,
    
    /// CHECK: Token account owner
    pub token_account_owner: AccountInfo<'info>,
    
    #[account(mut)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub token_mint: InterfaceAccount<'info, Mint>,
    
    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<HarvestFees>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;
    
    // Check if the token account is in fee exclusions
    if vault.is_fee_excluded(&ctx.accounts.token_account_owner.key()) {
        msg!("Account {} is excluded from fee harvesting", ctx.accounts.token_account_owner.key());
        return Ok(());
    }
    
    // Create vault signer seeds
    let vault_seeds = &[
        VAULT_SEED,
        vault.token_mint.as_ref(),
        &[vault.bump],
    ];
    let signer = &[&vault_seeds[..]];
    
    // Harvest withheld fees using Token-2022
    let cpi_accounts = token_2022::HarvestWithheldTokensToMint {
        mint: ctx.accounts.token_mint.to_account_info(),
        token_account_to_harvest: ctx.accounts.token_account.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
    
    token_2022::harvest_withheld_tokens_to_mint(cpi_ctx)?;
    
    // Update harvest timestamp
    vault.last_harvest_timestamp = clock.unix_timestamp;
    
    msg!("Harvested fees from account: {}", ctx.accounts.token_account.key());
    
    Ok(())
}
