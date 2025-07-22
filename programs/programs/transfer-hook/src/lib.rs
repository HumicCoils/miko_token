use anchor_lang::prelude::*;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta,
    seeds::Seed,
    state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::{ExecuteInstruction, InitializeExtraAccountMetaListInstruction};
use spl_discriminator::discriminator::SplDiscriminate;

declare_id!("4E8NzqDaN76o7zXjLo8hYetmiBKmAXPs6vUMFaqFfmg4");


pub const TRANSFER_HOOK_CONFIG_SEED: &[u8] = b"transfer-hook-config";


pub const ANTI_SNIPER_DURATION: i64 = 600; // 10 minutes in seconds

#[program]
pub mod transfer_hook {
    use super::*;

    // Initialize extra account meta list for the transfer hook
    #[instruction(discriminator = InitializeExtraAccountMetaListInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
        total_supply: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.transfer_hook_config;
        
        config.launch_time = 0; // Not launched yet
        config.token_mint = ctx.accounts.token_mint.key();
        config.total_supply = total_supply;
        config.authority = ctx.accounts.authority.key();
        
        // Initialize extra account metas
        let extra_account_metas = vec![
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal { bytes: TRANSFER_HOOK_CONFIG_SEED.to_vec() },
                    Seed::AccountKey { index: 1 }, // mint at index 1
                ],
                false, // not writable
                false, // not signer
            )?
        ];
        
        // Initialize the ExtraAccountMetaList
        let account_size = ExtraAccountMetaList::size_of(extra_account_metas.len()).unwrap();
        
        let account_info = &ctx.accounts.extra_account_meta_list.to_account_info();
        account_info.assign(&crate::ID);
        account_info.resize(account_size)?;
        
        let mut data = account_info.data.borrow_mut();
        ExtraAccountMetaList::init::<InitializeExtraAccountMetaListInstruction>(&mut data, &extra_account_metas)?;
        
        msg!("Transfer hook initialized for token mint: {}", ctx.accounts.token_mint.key());
        Ok(())
    }

    // The transfer hook execute instruction
    #[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
        let config = &ctx.accounts.transfer_hook_config;
        
        // If launch_time is 0, token hasn't launched yet - allow all transfers
        if config.launch_time == 0 {
            msg!("Token not launched yet, allowing transfer of {} tokens", amount);
            return Ok(());
        }
        
        let clock = Clock::get()?;
        let elapsed = clock.unix_timestamp - config.launch_time;
        
        // If within anti-sniper period (10 minutes)
        if elapsed > 0 && elapsed <= ANTI_SNIPER_DURATION {
            let max_allowed = config.total_supply / 100; // 1% of total supply
            
            require!(
                amount <= max_allowed,
                TransferHookError::TransferLimitExceeded
            );
            
            msg!(
                "Anti-sniper active: Transfer of {} tokens allowed (max: {})",
                amount,
                max_allowed
            );
        } else {
            msg!("Anti-sniper period ended, allowing transfer of {} tokens", amount);
        }
        
        Ok(())
    }

    pub fn set_launch_time(ctx: Context<SetLaunchTime>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        
        require!(
            config.launch_time == 0,
            TransferHookError::AlreadyLaunched
        );
        
        config.launch_time = Clock::get()?.unix_timestamp;
        msg!("Launch time set: {}", config.launch_time);
        
        Ok(())
    }

    pub fn update_authority(
        ctx: Context<UpdateAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = new_authority;
        msg!("Authority updated to: {}", new_authority);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + TransferHookConfig::INIT_SPACE,
        seeds = [TRANSFER_HOOK_CONFIG_SEED, token_mint.key().as_ref()],
        bump
    )]
    pub transfer_hook_config: Account<'info, TransferHookConfig>,
    
    /// CHECK: Extra account meta list
    #[account(
        init,
        payer = payer,
        space = ExtraAccountMetaList::size_of(1).unwrap(),
        seeds = [b"extra-account-metas", token_mint.key().as_ref()],
        bump
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    
    /// CHECK: The token mint this hook is for
    pub token_mint: UncheckedAccount<'info>,
    
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Execute<'info> {
    /// CHECK: Source token account
    pub source_token: UncheckedAccount<'info>,
    
    /// CHECK: Token mint
    pub mint: UncheckedAccount<'info>,
    
    /// CHECK: Destination token account
    pub destination_token: UncheckedAccount<'info>,
    
    /// CHECK: Source token account owner
    pub owner: UncheckedAccount<'info>,
    
    /// CHECK: Extra account meta list
    pub extra_account_meta_list: UncheckedAccount<'info>,
    
    // Our custom account - the config PDA
    #[account(
        seeds = [TRANSFER_HOOK_CONFIG_SEED, mint.key().as_ref()],
        bump
    )]
    pub transfer_hook_config: Account<'info, TransferHookConfig>,
}

#[derive(Accounts)]
pub struct SetLaunchTime<'info> {
    #[account(
        mut,
        seeds = [TRANSFER_HOOK_CONFIG_SEED, config.token_mint.as_ref()],
        bump,
        constraint = config.authority == authority.key() @ TransferHookError::Unauthorized
    )]
    pub config: Account<'info, TransferHookConfig>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateAuthority<'info> {
    #[account(
        mut,
        seeds = [TRANSFER_HOOK_CONFIG_SEED, config.token_mint.as_ref()],
        bump,
        constraint = config.authority == authority.key() @ TransferHookError::Unauthorized
    )]
    pub config: Account<'info, TransferHookConfig>,
    
    pub authority: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct TransferHookConfig {
    pub launch_time: i64,
    pub token_mint: Pubkey,
    pub total_supply: u64,
    pub authority: Pubkey,
}

#[error_code]
pub enum TransferHookError {
    #[msg("Transfer limit exceeded during anti-sniper period")]
    TransferLimitExceeded,
    
    #[msg("Already launched")]
    AlreadyLaunched,
    
    #[msg("Unauthorized")]
    Unauthorized,
}
