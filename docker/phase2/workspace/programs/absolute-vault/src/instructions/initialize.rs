use anchor_lang::prelude::*;
use crate::state::*;
use crate::constants::*;

#[derive(Accounts)]
#[instruction(min_hold_amount: u64)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = VaultState::LEN,
        seeds = [VAULT_SEED, token_mint.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, VaultState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: Treasury wallet for collecting owner share
    pub treasury: AccountInfo<'info>,
    
    /// CHECK: Owner wallet for receiving 1% share
    pub owner_wallet: AccountInfo<'info>,
    
    /// CHECK: Token mint for multi-token support
    pub token_mint: AccountInfo<'info>,
    
    /// CHECK: Keeper bot wallet
    pub keeper_wallet: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    min_hold_amount: u64,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    
    // Set vault state
    vault.authority = ctx.accounts.authority.key();
    vault.treasury = ctx.accounts.treasury.key();
    vault.owner_wallet = ctx.accounts.owner_wallet.key();
    vault.token_mint = ctx.accounts.token_mint.key();
    vault.min_hold_amount = min_hold_amount;
    vault.initialized = true;
    vault.bump = ctx.bumps.vault;
    
    // Store keys before mutable borrows
    let owner_wallet_key = vault.owner_wallet;
    let treasury_key = vault.treasury;
    let keeper_wallet_key = ctx.accounts.keeper_wallet.key();
    let vault_key = vault.key();
    
    // Automatically add system accounts to both exclusion lists
    // 1. Owner wallet
    vault.add_fee_exclusion(owner_wallet_key)?;
    vault.add_reward_exclusion(owner_wallet_key)?;
    
    // 2. Treasury
    vault.add_fee_exclusion(treasury_key)?;
    vault.add_reward_exclusion(treasury_key)?;
    
    // 3. Keeper bot
    vault.add_fee_exclusion(keeper_wallet_key)?;
    vault.add_reward_exclusion(keeper_wallet_key)?;
    
    // 4. Vault program itself
    vault.add_fee_exclusion(crate::ID)?;
    vault.add_reward_exclusion(crate::ID)?;
    
    // 5. Vault PDA
    vault.add_fee_exclusion(vault_key)?;
    vault.add_reward_exclusion(vault_key)?;
    
    msg\!("Vault initialized for token mint: {}", vault.token_mint);
    msg\!("Min hold amount: {}", vault.min_hold_amount);
    msg\!("System accounts automatically excluded from fees and rewards");
    
    Ok(())
}
