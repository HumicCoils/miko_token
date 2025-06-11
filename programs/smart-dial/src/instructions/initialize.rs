use anchor_lang::prelude::*;
use crate::{errors::SmartDialError, state::{SmartDialConfig, SMART_DIAL_CONFIG_SEED}};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    
    #[account(
        init,
        payer = admin,
        space = SmartDialConfig::LEN,
        seeds = [SMART_DIAL_CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, SmartDialConfig>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    keeper_bot_pubkey: Pubkey,
    treasury_wallet: Pubkey,
    owner_wallet: Pubkey,
    ai_agent_twitter_id: String,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    
    require!(!config.initialized, SmartDialError::AlreadyInitialized);
    
    require!(
        ai_agent_twitter_id.len() <= SmartDialConfig::MAX_TWITTER_ID_LEN,
        SmartDialError::TwitterIdTooLong
    );
    
    config.current_reward_token_mint = Pubkey::default(); // Will be set by keeper bot
    config.keeper_bot_pubkey = keeper_bot_pubkey;
    config.treasury_wallet = treasury_wallet;
    config.owner_wallet = owner_wallet;
    config.ai_agent_twitter_id = ai_agent_twitter_id;
    config.admin = ctx.accounts.admin.key();
    config.initialized = true;
    config.bump = ctx.bumps.config;
    
    msg!("Smart Dial initialized");
    msg!("Keeper bot: {}", keeper_bot_pubkey);
    msg!("Treasury wallet: {}", treasury_wallet);
    msg!("Owner wallet: {}", owner_wallet);
    msg!("AI agent Twitter ID: {}", config.ai_agent_twitter_id);
    
    Ok(())
}