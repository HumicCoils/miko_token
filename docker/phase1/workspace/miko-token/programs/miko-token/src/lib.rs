use anchor_lang::prelude::*;

declare_id!("GcibUqBVt43GBXfHehfVzjSREzEFA2YQXRb7ydh5fKxD");

#[program]
pub mod miko_token {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
