use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod test_program {
    use super::*;
    
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Test program initialized");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}