use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_transfer_hook_interface::error::TransferHookError as SplTransferHookError;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;
use spl_tlv_account_resolution::{
    state::ExtraAccountMetaList,
    account::ExtraAccountMeta,
    seeds::Seed,
};

declare_id!("2Mh6sSYeqeyqRZz8cr7y8gFtxyNf7HoMWqwzm9uTFav3");

const HOOK_CONFIG_SEED: &[u8] = b"hook-config";
const EXTRA_ACCOUNT_METAS_SEED: &[u8] = b"extra-account-metas";
const ANTI_SNIPER_DURATION: i64 = 600; // 10 minutes in seconds
const ANTI_SNIPER_LIMIT_BPS: u64 = 100; // 1% in basis points

// Error codes
#[error_code]
pub enum TransferHookError {
    #[msg("Transfer exceeds anti-sniper limit")]
    ExceedsAntiSniperLimit,
    #[msg("Invalid instruction")]
    InvalidInstruction,
    #[msg("Configuration already initialized")]
    AlreadyInitialized,
    #[msg("Not authorized")]
    Unauthorized,
}

#[program]
pub mod transfer_hook {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        total_supply: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.hook_config;
        
        require!(config.launch_timestamp == 0, TransferHookError::AlreadyInitialized);
        
        config.mint = ctx.accounts.mint.key();
        config.authority = ctx.accounts.authority.key();
        config.total_supply = total_supply;
        config.launch_timestamp = 0; // Will be set when launch happens
        config.anti_sniper_active = false;
        config.bump = ctx.bumps.hook_config;
        
        msg!("Transfer hook initialized for mint {}", ctx.accounts.mint.key());
        Ok(())
    }
    
    pub fn set_launch_time(ctx: Context<SetLaunchTime>) -> Result<()> {
        let config = &mut ctx.accounts.hook_config;
        
        require!(config.launch_timestamp == 0, TransferHookError::AlreadyInitialized);
        require!(ctx.accounts.authority.key() == config.authority, TransferHookError::Unauthorized);
        
        config.launch_timestamp = Clock::get()?.unix_timestamp;
        config.anti_sniper_active = true;
        
        msg!("Launch time set to {}", config.launch_timestamp);
        Ok(())
    }
    
    // Initialize extra account metas for the transfer hook
    pub fn initialize_extra_account_metas(
        ctx: Context<InitializeExtraAccountMetas>,
    ) -> Result<()> {
        // We need the hook config account to validate transfers
        let account_metas = vec![
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal { bytes: HOOK_CONFIG_SEED.to_vec() },
                    Seed::AccountKey { index: 0 }, // mint account is at index 0
                ],
                false, // Not writable
                false, // Not signer
            )?,
        ];

        // Initialize the extra account metas account
        ExtraAccountMetaList::init::<ExecuteInstruction>(
            &mut ctx.accounts.extra_account_metas.try_borrow_mut_data()?,
            &account_metas,
        )?;

        Ok(())
    }
    
    // The transfer hook function name must be 'execute' for SPL Transfer Hook Interface
    pub fn execute(ctx: Context<ExecuteTransferHook>, amount: u64) -> Result<()> {
        transfer_hook_impl(&ctx, amount)
    }
}

// Helper function to implement the transfer hook logic
fn transfer_hook_impl(ctx: &Context<ExecuteTransferHook>, amount: u64) -> Result<()> {
    let config = &ctx.accounts.hook_config;
    let clock = Clock::get()?;
    
    // If launch has not happened yet, allow all transfers
    if config.launch_timestamp == 0 || !config.anti_sniper_active {
        return Ok(());
    }
    
    // Check if we are still in the anti-sniper period
    let elapsed = clock.unix_timestamp - config.launch_timestamp;
    if elapsed >= ANTI_SNIPER_DURATION {
        // Anti-sniper period has ended, allow all transfers
        return Ok(());
    }
    
    // We are in the anti-sniper period, check the transfer amount
    let max_allowed = config.total_supply
        .checked_mul(ANTI_SNIPER_LIMIT_BPS)
        .unwrap()
        .checked_div(10000)
        .unwrap();
    
    require!(amount <= max_allowed, TransferHookError::ExceedsAntiSniperLimit);
    
    msg!("Transfer of {} allowed (max: {})", amount, max_allowed);
    Ok(())
}

// Account structures
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = TransferHookConfig::LEN,
        seeds = [HOOK_CONFIG_SEED, mint.key().as_ref()],
        bump
    )]
    pub hook_config: Account<'info, TransferHookConfig>,
    
    pub mint: InterfaceAccount<'info, Mint>,
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetLaunchTime<'info> {
    #[account(
        mut,
        seeds = [HOOK_CONFIG_SEED, hook_config.mint.as_ref()],
        bump = hook_config.bump
    )]
    pub hook_config: Account<'info, TransferHookConfig>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetas<'info> {
    #[account(
        init,
        payer = payer,
        space = ExtraAccountMetaList::size_of(1).unwrap(),
        seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump
    )]
    /// CHECK: This account is validated by the SPL Token-2022 program
    pub extra_account_metas: UncheckedAccount<'info>,
    
    pub mint: InterfaceAccount<'info, Mint>,
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteTransferHook<'info> {
    #[account(
        seeds = [HOOK_CONFIG_SEED, source_token.mint.as_ref()],
        bump = hook_config.bump
    )]
    pub hook_config: Account<'info, TransferHookConfig>,
    
    #[account(
        token::token_program = token_program
    )]
    pub source_token: InterfaceAccount<'info, TokenAccount>,
    
    #[account(
        token::token_program = token_program
    )]
    pub dest_token: InterfaceAccount<'info, TokenAccount>,
    
    /// CHECK: This can be any account that triggers the transfer
    pub authority: UncheckedAccount<'info>,
    
    /// CHECK: Extra accounts are validated by the transfer hook interface
    pub extra_account_metas: UncheckedAccount<'info>,
    
    /// CHECK: Validated by the Token-2022 program
    pub token_program: UncheckedAccount<'info>,
}

// State structures
#[account]
pub struct TransferHookConfig {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub total_supply: u64,
    pub launch_timestamp: i64,
    pub anti_sniper_active: bool,
    pub bump: u8,
}

impl TransferHookConfig {
    pub const LEN: usize = 8 + // discriminator
        32 + // mint
        32 + // authority
        8 + // total_supply
        8 + // launch_timestamp
        1 + // anti_sniper_active
        1; // bump
}
