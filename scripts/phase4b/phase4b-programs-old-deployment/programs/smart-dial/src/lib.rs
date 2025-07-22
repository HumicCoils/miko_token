use anchor_lang::prelude::*;

declare_id!("6nwvggz3Hoi2YEzsMbuHD8hEYtUmd7B8HxUJd9oRvgrw");


pub const DIAL_SEED: &[u8] = b"smart-dial";


pub const UPDATE_COOLDOWN: i64 = 86400; // 24 hours in seconds


pub const SECONDS_PER_WEEK: i64 = 604800; // 7 days

#[program]
pub mod smart_dial {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        authority: Pubkey,
        treasury: Pubkey,
    ) -> Result<()> {
        let dial_state = &mut ctx.accounts.dial_state;
        
        dial_state.authority = authority;
        dial_state.treasury = treasury;
        dial_state.current_reward_token = Pubkey::default(); // SOL (default)
        dial_state.last_update = 0;
        dial_state.launch_timestamp = Clock::get()?.unix_timestamp;
        
        msg!("Smart Dial initialized with SOL as default reward token");
        Ok(())
    }

    pub fn update_reward_token(
        ctx: Context<UpdateRewardToken>,
        new_reward_token: Pubkey,
    ) -> Result<()> {
        let dial_state = &mut ctx.accounts.dial_state;
        let clock = Clock::get()?;
        
        // Check if first Monday has passed
        let first_monday = calculate_first_monday(dial_state.launch_timestamp);
        require!(
            clock.unix_timestamp >= first_monday,
            SmartDialError::FirstMondayNotReached
        );
        
        // Check if today is Monday (UTC)
        let current_day = get_day_of_week(clock.unix_timestamp);
        require!(
            current_day == 1, // Monday
            SmartDialError::NotMonday
        );
        
        // Check 24-hour cooldown
        if dial_state.last_update > 0 {
            require!(
                clock.unix_timestamp - dial_state.last_update >= UPDATE_COOLDOWN,
                SmartDialError::UpdateCooldown
            );
        }
        
        // Update reward token
        let old_token = dial_state.current_reward_token;
        dial_state.current_reward_token = new_reward_token;
        dial_state.last_update = clock.unix_timestamp;
        
        // Add to history
        if dial_state.update_history.len() < 52 { // Keep last year of updates
            dial_state.update_history.push(UpdateEntry {
                timestamp: clock.unix_timestamp,
                old_token,
                new_token: new_reward_token,
            });
        } else {
            // Rotate history (remove oldest, add newest)
            dial_state.update_history.remove(0);
            dial_state.update_history.push(UpdateEntry {
                timestamp: clock.unix_timestamp,
                old_token,
                new_token: new_reward_token,
            });
        }
        
        msg!("Reward token updated from {} to {}", old_token, new_reward_token);
        Ok(())
    }

    pub fn update_treasury(
        ctx: Context<UpdateConfig>,
        new_treasury: Pubkey,
    ) -> Result<()> {
        let dial_state = &mut ctx.accounts.dial_state;
        dial_state.treasury = new_treasury;
        msg!("Treasury updated to: {}", new_treasury);
        Ok(())
    }

    pub fn update_authority(
        ctx: Context<UpdateConfig>,
        new_authority: Pubkey,
    ) -> Result<()> {
        let dial_state = &mut ctx.accounts.dial_state;
        dial_state.authority = new_authority;
        msg!("Authority updated to: {}", new_authority);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + DialState::INIT_SPACE,
        seeds = [DIAL_SEED],
        bump
    )]
    pub dial_state: Account<'info, DialState>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateRewardToken<'info> {
    #[account(
        mut,
        seeds = [DIAL_SEED],
        bump,
        constraint = dial_state.authority == authority.key() @ SmartDialError::Unauthorized
    )]
    pub dial_state: Account<'info, DialState>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [DIAL_SEED],
        bump,
        constraint = dial_state.authority == authority.key() @ SmartDialError::Unauthorized
    )]
    pub dial_state: Account<'info, DialState>,
    
    pub authority: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct DialState {
    pub authority: Pubkey,
    pub current_reward_token: Pubkey,
    pub treasury: Pubkey,
    pub last_update: i64,
    pub launch_timestamp: i64,
    #[max_len(52)] // Keep last year of weekly updates
    pub update_history: Vec<UpdateEntry>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct UpdateEntry {
    pub timestamp: i64,
    pub old_token: Pubkey,
    pub new_token: Pubkey,
}

#[error_code]
pub enum SmartDialError {
    #[msg("Unauthorized")]
    Unauthorized,
    
    #[msg("Not Monday (UTC)")]
    NotMonday,
    
    #[msg("24-hour update cooldown not met")]
    UpdateCooldown,
    
    #[msg("First Monday after launch not reached")]
    FirstMondayNotReached,
}

// Helper functions
fn calculate_first_monday(launch_timestamp: i64) -> i64 {
    // Get day of week for launch (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    let launch_day = get_day_of_week(launch_timestamp);
    
    // Calculate days until next Monday
    let days_until_monday = if launch_day <= 1 {
        1 - launch_day
    } else {
        8 - launch_day
    };
    
    // Add days to get first Monday
    launch_timestamp + (days_until_monday * 86400)
}

fn get_day_of_week(timestamp: i64) -> i64 {
    // Unix epoch (Jan 1, 1970) was a Thursday (day 4)
    // So we need to adjust by 4 days
    ((timestamp / 86400 + 4) % 7)
}
