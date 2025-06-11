use anchor_lang::prelude::*;
use crate::{errors::SmartDialError, state::{SmartDialConfig, SMART_DIAL_CONFIG_SEED}};

#[derive(Accounts)]
pub struct UpdateWallets<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    
    #[account(
        mut,
        seeds = [SMART_DIAL_CONFIG_SEED],
        bump = config.bump,
        constraint = config.initialized @ SmartDialError::NotInitialized,
        constraint = config.admin == admin.key() @ SmartDialError::UnauthorizedAccess
    )]
    pub config: Account<'info, SmartDialConfig>,
}

pub fn handler(
    ctx: Context<UpdateWallets>,
    new_treasury_wallet: Option<Pubkey>,
    new_owner_wallet: Option<Pubkey>,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    
    // Ensure at least one update is requested
    require!(
        new_treasury_wallet.is_some() || new_owner_wallet.is_some(),
        SmartDialError::NoChangesRequested
    );
    
    let mut updated = false;
    
    if let Some(new_treasury) = new_treasury_wallet {
        require!(
            new_treasury != Pubkey::default(),
            SmartDialError::InvalidWalletAddress
        );
        
        let old_treasury = config.treasury_wallet;
        config.treasury_wallet = new_treasury;
        
        emit!(WalletUpdated {
            wallet_type: "treasury".to_string(),
            old_wallet: old_treasury,
            new_wallet: new_treasury,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        msg!("Treasury wallet updated from {} to {}", old_treasury, new_treasury);
        updated = true;
    }
    
    if let Some(new_owner) = new_owner_wallet {
        require!(
            new_owner != Pubkey::default(),
            SmartDialError::InvalidWalletAddress
        );
        
        let old_owner = config.owner_wallet;
        config.owner_wallet = new_owner;
        
        emit!(WalletUpdated {
            wallet_type: "owner".to_string(),
            old_wallet: old_owner,
            new_wallet: new_owner,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        msg!("Owner wallet updated from {} to {}", old_owner, new_owner);
        updated = true;
    }
    
    require!(updated, SmartDialError::NoChangesRequested);
    
    Ok(())
}

#[event]
pub struct WalletUpdated {
    pub wallet_type: String,
    pub old_wallet: Pubkey,
    pub new_wallet: Pubkey,
    pub timestamp: i64,
}