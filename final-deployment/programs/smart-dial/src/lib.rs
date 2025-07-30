use anchor_lang::prelude::*;

// Program ID is dynamically generated from keypair at compile time
include!(concat!(env!("OUT_DIR"), "/program_id.rs"));

pub const DIAL_STATE_SEED: &[u8] = b"dial_state";
pub const SECONDS_PER_WEEK: i64 = 7 * 24 * 60 * 60;
pub const UPDATE_COOLDOWN: i64 = 24 * 60 * 60; // 24 hours
pub const SOL_MINT: Pubkey = pubkey!("So11111111111111111111111111111111111111112");

#[program]
pub mod smart_dial {
    use super::*;

    /// Initialize Smart Dial with launch timestamp
    pub fn initialize(
        ctx: Context<Initialize>,
        launch_timestamp: i64,
    ) -> Result<()> {
        let dial = &mut ctx.accounts.dial_state;
        
        dial.authority = ctx.accounts.authority.key();
        dial.current_reward_token = SOL_MINT; // SOL is default reward token
        dial.last_update = 0;
        dial.update_count = 0;
        dial.launch_timestamp = launch_timestamp;
        
        // Initialize update history
        dial.update_history = Vec::new();
        
        msg!("Smart Dial initialized");
        msg!("Authority: {}", dial.authority);
        msg!("Initial reward token: SOL");
        msg!("Launch timestamp: {}", launch_timestamp);
        
        Ok(())
    }

    /// Update reward token for the week
    pub fn update_reward_token(
        ctx: Context<UpdateRewardToken>,
        new_reward_token: Pubkey,
    ) -> Result<()> {
        let dial = &mut ctx.accounts.dial_state;
        let current_time = Clock::get()?.unix_timestamp;
        
        // Calculate first Monday after launch
        let first_monday = calculate_first_monday(dial.launch_timestamp);
        
        // Check if we're past the first Monday
        require!(
            current_time >= first_monday,
            DialError::TooEarlyToUpdate
        );
        
        // Enforce cooldown (except for first update)
        if dial.last_update > 0 {
            require!(
                current_time >= dial.last_update + UPDATE_COOLDOWN,
                DialError::UpdateCooldown
            );
        }
        
        // Store in update history
        if dial.update_history.len() >= 52 { // Keep last year of history
            dial.update_history.remove(0);
        }
        
        // Store values before mutable borrow
        let old_token = dial.current_reward_token;
        let update_number = dial.update_count;
        
        dial.update_history.push(UpdateRecord {
            timestamp: current_time,
            old_token,
            new_token: new_reward_token,
            update_number,
        });
        
        // Update reward token
        dial.current_reward_token = new_reward_token;
        dial.last_update = current_time;
        dial.update_count += 1;
        
        msg!("Reward token updated to: {}", new_reward_token);
        msg!("Update count: {}", dial.update_count);
        msg!("Next update available after: {}", current_time + UPDATE_COOLDOWN);
        
        Ok(())
    }

    /// Transfer authority
    pub fn update_authority(
        ctx: Context<UpdateAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        ctx.accounts.dial_state.authority = new_authority;
        
        msg!("Authority updated to: {}", new_authority);
        
        Ok(())
    }
}

// Helper function to calculate first Monday after launch
fn calculate_first_monday(launch_timestamp: i64) -> i64 {
    // Calculate days since Unix epoch for launch
    let launch_days = launch_timestamp / (24 * 60 * 60);
    
    // January 1, 1970 was a Thursday (day 4, where Monday = 1)
    // So days_since_epoch % 7 gives us: 0=Thu, 1=Fri, 2=Sat, 3=Sun, 4=Mon, 5=Tue, 6=Wed
    let launch_day_of_week = ((launch_days + 4) % 7) as i64;
    
    // Calculate days until next Monday
    // If launch is Monday (4), days_until = 7 (next Monday)
    // If launch is Tuesday (5), days_until = 6
    // If launch is Sunday (3), days_until = 1
    let days_until_monday = if launch_day_of_week == 4 {
        7 // If launch is Monday, wait until next Monday
    } else if launch_day_of_week < 4 {
        4 - launch_day_of_week // Thu=0->4, Fri=1->3, Sat=2->2, Sun=3->1
    } else {
        11 - launch_day_of_week // Tue=5->6, Wed=6->5
    };
    
    launch_timestamp + (days_until_monday * 24 * 60 * 60)
}

// Account structures

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + DialState::INIT_SPACE,
        seeds = [DIAL_STATE_SEED],
        bump
    )]
    pub dial_state: Account<'info, DialState>,
    
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateRewardToken<'info> {
    #[account(
        mut,
        seeds = [DIAL_STATE_SEED],
        bump,
        constraint = dial_state.authority == authority.key() @ DialError::Unauthorized
    )]
    pub dial_state: Account<'info, DialState>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateAuthority<'info> {
    #[account(
        mut,
        seeds = [DIAL_STATE_SEED],
        bump,
        constraint = dial_state.authority == authority.key() @ DialError::Unauthorized
    )]
    pub dial_state: Account<'info, DialState>,
    
    pub authority: Signer<'info>,
}

// State

#[account]
#[derive(InitSpace)]
pub struct DialState {
    pub authority: Pubkey,
    pub current_reward_token: Pubkey,
    pub last_update: i64,
    pub update_count: u64,
    pub launch_timestamp: i64,
    #[max_len(52)] // Keep last year of updates
    pub update_history: Vec<UpdateRecord>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct UpdateRecord {
    pub timestamp: i64,
    pub old_token: Pubkey,
    pub new_token: Pubkey,
    pub update_number: u64,
}

// Errors

#[error_code]
pub enum DialError {
    #[msg("Unauthorized")]
    Unauthorized,
    
    #[msg("Update cooldown not met (24 hours)")]
    UpdateCooldown,
    
    #[msg("Cannot update before first Monday after launch")]
    TooEarlyToUpdate,
}