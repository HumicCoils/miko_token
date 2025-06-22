use anchor_lang::prelude::*;
use crate::state::DialConfig;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = DialConfig::LEN,
        seeds = [b"smart_dial_config"],
        bump
    )]
    pub dial_config: Account<'info, DialConfig>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    keeper_bot_wallet: Pubkey,
    treasury_wallet: Pubkey,
) -> Result<()> {
    let config = &mut ctx.accounts.dial_config;
    
    config.authority = ctx.accounts.authority.key();
    config.keeper_bot_wallet = keeper_bot_wallet;
    config.treasury_wallet = treasury_wallet;
    config.current_reward_token = Pubkey::default(); // Will be set on first update
    config.current_token_symbol = String::new();
    config.last_update = 0;
    config.total_updates = 0;
    config.initialized = true;
    config.bump = ctx.bumps.dial_config;
    
    msg!("Smart Dial initialized");
    msg!("Keeper bot: {}", keeper_bot_wallet);
    msg!("Treasury: {}", treasury_wallet);
    
    Ok(())
}