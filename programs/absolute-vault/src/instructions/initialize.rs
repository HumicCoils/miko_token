use anchor_lang::prelude::*;
use crate::{constants::*, errors::VaultError, state::TaxConfig};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = TaxConfig::LEN,
        seeds = [TAX_CONFIG_SEED],
        bump
    )]
    pub tax_config: Account<'info, TaxConfig>,
    
    /// CHECK: PDA for tax authority
    #[account(
        seeds = [TAX_AUTHORITY_SEED],
        bump
    )]
    pub tax_authority_pda: UncheckedAccount<'info>,
    
    /// CHECK: PDA for tax holding
    #[account(
        seeds = [TAX_HOLDING_SEED],
        bump
    )]
    pub tax_holding_pda: UncheckedAccount<'info>,
    
    /// CHECK: Token mint to be validated
    pub token_mint: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
    /// CHECK: Token-2022 program
    pub token_2022_program: UncheckedAccount<'info>,
}

pub fn handler(
    ctx: Context<Initialize>,
    smart_dial_program: Pubkey,
    keeper_bot_wallet: Pubkey,
    owner_wallet: Pubkey,
) -> Result<()> {
    let tax_config = &mut ctx.accounts.tax_config;
    
    require!(!tax_config.initialized, VaultError::AlreadyInitialized);
    
    tax_config.authority = ctx.accounts.authority.key();
    tax_config.tax_authority_pda = ctx.accounts.tax_authority_pda.key();
    tax_config.tax_holding_pda = ctx.accounts.tax_holding_pda.key();
    tax_config.smart_dial_program = smart_dial_program;
    tax_config.token_mint = ctx.accounts.token_mint.key();
    tax_config.keeper_bot_wallet = keeper_bot_wallet;
    tax_config.owner_wallet = owner_wallet;
    tax_config.initialized = true;
    tax_config.bump = ctx.bumps.tax_config;
    
    msg!("Absolute Vault initialized with tax rate: {}%", TAX_RATE);
    msg!("Owner wallet: {} (receives 1%)", owner_wallet);
    msg!("Treasury receives 4% for swapping and distribution");
    msg!("Keeper bot wallet: {}", keeper_bot_wallet);
    
    Ok(())
}