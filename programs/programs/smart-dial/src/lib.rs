use anchor_lang::prelude::*;

declare_id!("2Ymuq9Nt9s1GH1qGVuFd6jCqefJcmsPReE3MmiieEhZc");

const DIAL_SEED: &[u8] = b"smart-dial";
const SECONDS_PER_DAY: i64 = 86400;
const SECONDS_PER_WEEK: i64 = 604800;
const UPDATE_HISTORY_SIZE: usize = 52; // Track last 52 updates (1 year of weekly updates)

// Error codes
#[error_code]
pub enum SmartDialError {
    #[msg("Not Monday - updates only allowed on Mondays")]
    NotMonday,
    #[msg("Update too soon - 24 hour minimum between updates")]
    UpdateTooSoon,
    #[msg("First Monday not reached yet")]
    FirstMondayNotReached,
    #[msg("Not authorized")]
    Unauthorized,
    #[msg("Invalid reward token")]
    InvalidRewardToken,
}

#[program]
pub mod smart_dial {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        launch_timestamp: i64,
    ) -> Result<()> {
        let dial = &mut ctx.accounts.dial_state;
        
        dial.authority = ctx.accounts.authority.key();
        dial.treasury = ctx.accounts.treasury.key();
        dial.launch_timestamp = launch_timestamp;
        
        // Default reward token is SOL (native mint)
        dial.current_reward_token = spl_token_2022::native_mint::ID;
        dial.last_update_timestamp = 0;
        dial.total_updates = 0;
        dial.bump = ctx.bumps.dial_state;
        
        // Initialize update history
        dial.update_history = Vec::with_capacity(UPDATE_HISTORY_SIZE);
        
        msg!("Smart Dial initialized with launch timestamp {}", launch_timestamp);
        Ok(())
    }
    
    pub fn update_reward_token(
        ctx: Context<UpdateRewardToken>,
        new_reward_token: Pubkey,
    ) -> Result<()> {
        let dial = &mut ctx.accounts.dial_state;
        let clock = Clock::get()?;
        
        // Only the authority can update
        require!(ctx.accounts.authority.key() == dial.authority, SmartDialError::Unauthorized);
        
        // Calculate first Monday after launch
        let first_monday = calculate_first_monday(dial.launch_timestamp);
        
        // Check if we have reached the first Monday
        require!(clock.unix_timestamp >= first_monday, SmartDialError::FirstMondayNotReached);
        
        // Check if today is Monday (after first Monday)
        require!(is_monday(clock.unix_timestamp), SmartDialError::NotMonday);
        
        // Check 24-hour constraint
        if dial.last_update_timestamp > 0 {
            let elapsed = clock.unix_timestamp - dial.last_update_timestamp;
            require!(elapsed >= SECONDS_PER_DAY, SmartDialError::UpdateTooSoon);
        }
        
        // Validate the new reward token
        require!(new_reward_token != Pubkey::default(), SmartDialError::InvalidRewardToken);
        
        // Record the update in history
        let old_token = dial.current_reward_token;
        let update = UpdateRecord {
            timestamp: clock.unix_timestamp,
            old_token: dial.current_reward_token,
            new_token: new_reward_token,
        };
        
        // Add to history, removing oldest if at capacity
        if dial.update_history.len() >= UPDATE_HISTORY_SIZE {
            dial.update_history.remove(0);
        }
        dial.update_history.push(update);
        
        // Update the current reward token
        dial.current_reward_token = new_reward_token;
        dial.last_update_timestamp = clock.unix_timestamp;
        dial.total_updates += 1;
        
        msg!("Reward token updated from {} to {}", old_token, new_reward_token);
        Ok(())
    }
    
    pub fn update_treasury(
        ctx: Context<UpdateTreasury>,
        new_treasury: Pubkey,
    ) -> Result<()> {
        let dial = &mut ctx.accounts.dial_state;
        
        require!(ctx.accounts.authority.key() == dial.authority, SmartDialError::Unauthorized);
        
        dial.treasury = new_treasury;
        
        msg!("Treasury updated to {}", new_treasury);
        Ok(())
    }
    
    pub fn update_authority(
        ctx: Context<UpdateAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        let dial = &mut ctx.accounts.dial_state;
        
        require!(ctx.accounts.authority.key() == dial.authority, SmartDialError::Unauthorized);
        
        dial.authority = new_authority;
        
        msg!("Authority updated to {}", new_authority);
        Ok(())
    }
}

// Helper functions
fn calculate_first_monday(launch_timestamp: i64) -> i64 {
    // Convert timestamp to days since Unix epoch
    let launch_day = launch_timestamp / SECONDS_PER_DAY;
    
    // January 1, 1970 was a Thursday (day 4, where Monday = 1)
    // Days since epoch % 7 gives us: 0=Thu, 1=Fri, 2=Sat, 3=Sun, 4=Mon, 5=Tue, 6=Wed
    let launch_weekday = ((launch_day + 4) % 7) as u8;
    
    // Calculate days until next Monday (1)
    let days_to_monday = if launch_weekday <= 4 {
        4 - launch_weekday // If Thu-Mon, days until next Mon
    } else {
        11 - launch_weekday // If Tue-Wed, days until Mon of next week
    } as i64;
    
    // Return timestamp of first Monday at 00:00 UTC
    (launch_day + days_to_monday) * SECONDS_PER_DAY
}

fn is_monday(timestamp: i64) -> bool {
    let day = timestamp / SECONDS_PER_DAY;
    // Monday is when (days + 4) % 7 == 4
    ((day + 4) % 7) == 4
}

// Account structures
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = DialState::LEN,
        seeds = [DIAL_SEED],
        bump
    )]
    pub dial_state: Account<'info, DialState>,
    
    pub authority: Signer<'info>,
    /// CHECK: Treasury can be any valid account
    pub treasury: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateRewardToken<'info> {
    #[account(
        mut,
        seeds = [DIAL_SEED],
        bump = dial_state.bump
    )]
    pub dial_state: Account<'info, DialState>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateTreasury<'info> {
    #[account(
        mut,
        seeds = [DIAL_SEED],
        bump = dial_state.bump
    )]
    pub dial_state: Account<'info, DialState>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateAuthority<'info> {
    #[account(
        mut,
        seeds = [DIAL_SEED],
        bump = dial_state.bump
    )]
    pub dial_state: Account<'info, DialState>,
    
    pub authority: Signer<'info>,
}

// State structures
#[account]
pub struct DialState {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub launch_timestamp: i64,
    pub current_reward_token: Pubkey,
    pub last_update_timestamp: i64,
    pub total_updates: u64,
    pub bump: u8,
    pub update_history: Vec<UpdateRecord>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateRecord {
    pub timestamp: i64,
    pub old_token: Pubkey,
    pub new_token: Pubkey,
}

impl DialState {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // treasury
        8 + // launch_timestamp
        32 + // current_reward_token
        8 + // last_update_timestamp
        8 + // total_updates
        1 + // bump
        4 + (UPDATE_HISTORY_SIZE * UpdateRecord::LEN); // update_history vec
}

impl UpdateRecord {
    pub const LEN: usize = 8 + // timestamp
        32 + // old_token
        32; // new_token
}
