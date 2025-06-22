use anchor_lang::prelude::*;
use crate::{constants::*, errors::VaultError, state::{TaxConfig, ExclusionList}};

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
    
    #[account(
        init,
        payer = authority,
        space = ExclusionList::LEN,
        seeds = [EXCLUSIONS_SEED],
        bump
    )]
    pub exclusion_list: Account<'info, ExclusionList>,
    
    /// CHECK: Fee authority PDA for Token-2022
    #[account(
        seeds = [FEE_AUTHORITY_SEED],
        bump
    )]
    pub fee_authority: UncheckedAccount<'info>,
    
    /// CHECK: Withdraw authority PDA for Token-2022
    #[account(
        seeds = [WITHDRAW_AUTHORITY_SEED],
        bump
    )]
    pub withdraw_authority: UncheckedAccount<'info>,
    
    /// CHECK: Treasury wallet from Smart Dial
    pub treasury_wallet: UncheckedAccount<'info>,
    
    /// CHECK: MIKO token mint
    pub miko_token_mint: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    smart_dial_program: Pubkey,
    keeper_bot_wallet: Pubkey,
    owner_wallet: Pubkey,
) -> Result<()> {
    let tax_config = &mut ctx.accounts.tax_config;
    let exclusion_list = &mut ctx.accounts.exclusion_list;
    
    // Initialize tax config
    tax_config.authority = ctx.accounts.authority.key();
    tax_config.miko_token_mint = ctx.accounts.miko_token_mint.key();
    tax_config.fee_authority = ctx.accounts.fee_authority.key();
    tax_config.withdraw_authority = ctx.accounts.withdraw_authority.key();
    tax_config.smart_dial_program = smart_dial_program;
    tax_config.keeper_bot_wallet = keeper_bot_wallet;
    tax_config.owner_wallet = owner_wallet;
    tax_config.treasury_wallet = ctx.accounts.treasury_wallet.key();
    tax_config.total_fees_collected = 0;
    tax_config.initialized = true;
    tax_config.bump = ctx.bumps.tax_config;
    
    // Initialize exclusion list
    exclusion_list.authority = ctx.accounts.authority.key();
    exclusion_list.reward_exclusions = vec![
        // Exclude program accounts
        smart_dial_program,
        ctx.program_id.clone(),
        tax_config.treasury_wallet,
        spl_token_2022::id(),
    ];
    exclusion_list.tax_exemptions = vec![];
    exclusion_list.bump = ctx.bumps.exclusion_list;
    
    msg!("Absolute Vault initialized");
    msg!("Fee authority: {}", tax_config.fee_authority);
    msg!("Withdraw authority: {}", tax_config.withdraw_authority);
    
    Ok(())
}