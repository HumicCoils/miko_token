use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token::{self, Mint, Token, TokenAccount};
use solana_program_test::*;
use solana_sdk::{
    account::Account,
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_instruction,
    transaction::Transaction,
};
use spl_token_2022::{
    extension::{
        transfer_fee::{TransferFee, TransferFeeConfig},
        BaseStateWithExtensions, ExtensionType,
    },
    state::{Account as TokenAccountState, Mint as MintState},
};
use std::convert::TryInto;

use absolute_vault::*;
use absolute_vault::state::*;
use absolute_vault::instructions::*;

const DECIMALS: u8 = 9;
const FEE_BASIS_POINTS: u16 = 500; // 5%
const MAX_FEE: u64 = u64::MAX;

#[tokio::test]
async fn test_initialize_vault() {
    let mut context = TestContext::new().await;
    
    // Initialize vault
    let result = context.initialize_vault().await;
    assert!(result.is_ok(), "Failed to initialize vault");
    
    // Verify vault state
    let vault_state = context.get_vault_state().await;
    assert_eq!(vault_state.authority, context.authority.pubkey());
    assert_eq!(vault_state.keeper_wallet, context.keeper.pubkey());
    assert_eq!(vault_state.treasury_wallet, context.treasury.pubkey());
    assert_eq!(vault_state.owner_wallet, context.owner.pubkey());
    assert_eq!(vault_state.total_fees_collected, 0);
    assert_eq!(vault_state.total_rewards_distributed, 0);
    assert_eq!(vault_state.minimum_usd_value, 100);
    assert_eq!(vault_state.price_feed_id, [0u8; 32]);
    assert_eq!(vault_state.is_initialized, true);
}

#[tokio::test]
async fn test_system_exclusions() {
    let mut context = TestContext::new().await;
    context.initialize_vault().await.unwrap();
    
    // Initialize system exclusions
    let result = context.initialize_system_exclusions().await;
    assert!(result.is_ok(), "Failed to initialize system exclusions");
    
    // Check that system accounts are excluded
    let treasury_excluded = context.check_exclusion(&context.treasury.pubkey()).await;
    assert!(treasury_excluded.is_some(), "Treasury should be excluded");
    assert_eq!(treasury_excluded.unwrap().exclusion_type, ExclusionType::Both as u8);
    
    let owner_excluded = context.check_exclusion(&context.owner.pubkey()).await;
    assert!(owner_excluded.is_some(), "Owner should be excluded");
    assert_eq!(owner_excluded.unwrap().exclusion_type, ExclusionType::Both as u8);
}

#[tokio::test]
async fn test_harvest_fees() {
    let mut context = TestContext::new().await;
    context.initialize_vault().await.unwrap();
    context.initialize_system_exclusions().await.unwrap();
    
    // Create test accounts with fees
    let holder1 = Keypair::new();
    let holder2 = Keypair::new();
    
    // Create token accounts with withheld fees
    context.create_token_account_with_fees(&holder1.pubkey(), 1000).await;
    context.create_token_account_with_fees(&holder2.pubkey(), 2000).await;
    
    // Harvest fees
    let accounts = vec![holder1.pubkey(), holder2.pubkey()];
    let result = context.harvest_fees(accounts).await;
    assert!(result.is_ok(), "Failed to harvest fees");
    
    // Verify fees were collected
    let vault_state = context.get_vault_state().await;
    assert!(vault_state.total_fees_collected > 0, "No fees collected");
    
    // Check that withheld fees were cleared
    let holder1_account = context.get_token_account(&holder1.pubkey()).await;
    assert_eq!(holder1_account.withheld_amount, 0, "Withheld fees not cleared");
}

#[tokio::test]
async fn test_reward_distribution() {
    let mut context = TestContext::new().await;
    context.initialize_vault().await.unwrap();
    context.initialize_system_exclusions().await.unwrap();
    
    // Create eligible holders (>$100 worth)
    let eligible_holder1 = Keypair::new();
    let eligible_holder2 = Keypair::new();
    let ineligible_holder = Keypair::new();
    
    // Create accounts with different balances
    context.create_token_account(&eligible_holder1.pubkey(), 150_000_000_000).await; // $150 worth
    context.create_token_account(&eligible_holder2.pubkey(), 200_000_000_000).await; // $200 worth
    context.create_token_account(&ineligible_holder.pubkey(), 50_000_000_000).await; // $50 worth
    
    // Add rewards to vault
    context.add_rewards_to_vault(1000_000_000).await;
    
    // Distribute rewards
    let holders = vec![
        eligible_holder1.pubkey(),
        eligible_holder2.pubkey(),
        ineligible_holder.pubkey(),
    ];
    let result = context.distribute_rewards(holders).await;
    assert!(result.is_ok(), "Failed to distribute rewards");
    
    // Verify distribution
    let vault_state = context.get_vault_state().await;
    assert!(vault_state.total_rewards_distributed > 0, "No rewards distributed");
    
    // Check that eligible holders received rewards
    let holder1_balance = context.get_token_balance(&eligible_holder1.pubkey()).await;
    let holder2_balance = context.get_token_balance(&eligible_holder2.pubkey()).await;
    let ineligible_balance = context.get_token_balance(&ineligible_holder.pubkey()).await;
    
    assert!(holder1_balance > 150_000_000_000, "Eligible holder1 didn't receive rewards");
    assert!(holder2_balance > 200_000_000_000, "Eligible holder2 didn't receive rewards");
    assert_eq!(ineligible_balance, 50_000_000_000, "Ineligible holder received rewards");
}

#[tokio::test]
async fn test_exclusion_management() {
    let mut context = TestContext::new().await;
    context.initialize_vault().await.unwrap();
    
    let test_wallet = Keypair::new();
    
    // Add fee exclusion
    let result = context.manage_exclusion(
        &test_wallet.pubkey(),
        ExclusionAction::Add,
        ExclusionType::FeeOnly,
    ).await;
    assert!(result.is_ok(), "Failed to add fee exclusion");
    
    // Verify exclusion
    let exclusion = context.check_exclusion(&test_wallet.pubkey()).await;
    assert!(exclusion.is_some(), "Exclusion not found");
    assert_eq!(exclusion.unwrap().exclusion_type, ExclusionType::FeeOnly as u8);
    
    // Update to both exclusion
    let result = context.manage_exclusion(
        &test_wallet.pubkey(),
        ExclusionAction::Add,
        ExclusionType::Both,
    ).await;
    assert!(result.is_ok(), "Failed to update exclusion");
    
    // Verify updated exclusion
    let exclusion = context.check_exclusion(&test_wallet.pubkey()).await;
    assert_eq!(exclusion.unwrap().exclusion_type, ExclusionType::Both as u8);
    
    // Remove exclusion
    let result = context.manage_exclusion(
        &test_wallet.pubkey(),
        ExclusionAction::Remove,
        ExclusionType::Both,
    ).await;
    assert!(result.is_ok(), "Failed to remove exclusion");
    
    // Verify removal
    let exclusion = context.check_exclusion(&test_wallet.pubkey()).await;
    assert!(exclusion.is_none(), "Exclusion not removed");
}

#[tokio::test]
async fn test_system_exclusion_protection() {
    let mut context = TestContext::new().await;
    context.initialize_vault().await.unwrap();
    context.initialize_system_exclusions().await.unwrap();
    
    // Try to remove system exclusion (should fail)
    let result = context.manage_exclusion(
        &context.treasury.pubkey(),
        ExclusionAction::Remove,
        ExclusionType::Both,
    ).await;
    assert!(result.is_err(), "System exclusion removal should fail");
}

#[tokio::test]
async fn test_emergency_withdrawals() {
    let mut context = TestContext::new().await;
    context.initialize_vault().await.unwrap();
    
    // Add funds to vault
    context.add_rewards_to_vault(1000_000_000).await;
    
    // Test emergency withdrawal
    let initial_balance = context.get_sol_balance(&context.authority.pubkey()).await;
    let result = context.emergency_withdraw_vault(100_000_000).await;
    assert!(result.is_ok(), "Failed to emergency withdraw");
    
    let final_balance = context.get_sol_balance(&context.authority.pubkey()).await;
    assert_eq!(final_balance, initial_balance + 100_000_000, "Incorrect withdrawal amount");
}

#[tokio::test]
async fn test_authority_update() {
    let mut context = TestContext::new().await;
    context.initialize_vault().await.unwrap();
    
    let new_authority = Keypair::new();
    
    // Update authority
    let result = context.update_authority(&new_authority.pubkey()).await;
    assert!(result.is_ok(), "Failed to update authority");
    
    // Verify authority changed
    let vault_state = context.get_vault_state().await;
    assert_eq!(vault_state.authority, new_authority.pubkey());
    
    // Old authority should no longer have access
    context.authority = new_authority;
    let test_wallet = Keypair::new();
    let result = context.manage_exclusion(
        &test_wallet.pubkey(),
        ExclusionAction::Add,
        ExclusionType::FeeOnly,
    ).await;
    assert!(result.is_ok(), "New authority should have access");
}

#[tokio::test]
async fn test_harvest_limit() {
    let mut context = TestContext::new().await;
    context.initialize_vault().await.unwrap();
    
    // Create more than 20 accounts with fees
    let mut accounts = vec![];
    for i in 0..25 {
        let holder = Keypair::new();
        context.create_token_account_with_fees(&holder.pubkey(), 100).await;
        accounts.push(holder.pubkey());
    }
    
    // Harvest should process only first 20
    let result = context.harvest_fees(accounts.clone()).await;
    assert!(result.is_ok(), "Failed to harvest fees");
    
    // Verify only 20 were processed
    let mut processed = 0;
    for (i, account) in accounts.iter().enumerate() {
        let token_account = context.get_token_account(account).await;
        if token_account.withheld_amount == 0 {
            processed += 1;
        }
    }
    assert_eq!(processed, 20, "Should process exactly 20 accounts");
}

// Test context helper
struct TestContext {
    program_test: ProgramTest,
    context: ProgramTestContext,
    authority: Keypair,
    keeper: Keypair,
    treasury: Keypair,
    owner: Keypair,
    mint: Pubkey,
    vault_pda: Pubkey,
    treasury_vault: Pubkey,
    owner_vault: Pubkey,
    reward_token: Pubkey,
}

impl TestContext {
    async fn new() -> Self {
        let mut program_test = ProgramTest::new(
            "absolute_vault",
            absolute_vault::id(),
            processor!(absolute_vault::entry),
        );
        
        // Add Token and Token2022 programs
        program_test.add_program("spl_token", spl_token::id(), None);
        program_test.add_program("spl_token_2022", spl_token_2022::id(), None);
        
        let authority = Keypair::new();
        let keeper = Keypair::new();
        let treasury = Keypair::new();
        let owner = Keypair::new();
        
        // Create MIKO token mint with transfer fee
        let mint = Keypair::new();
        let reward_token = Keypair::new();
        
        // Initialize context
        let mut context = program_test.start_with_context().await;
        
        // Fund accounts
        for account in [&authority, &keeper, &treasury, &owner] {
            context.banks_client.process_transaction(
                Transaction::new_signed_with_payer(
                    &[system_instruction::transfer(
                        &context.payer.pubkey(),
                        &account.pubkey(),
                        1_000_000_000,
                    )],
                    Some(&context.payer.pubkey()),
                    &[&context.payer],
                    context.last_blockhash,
                ),
            ).await.unwrap();
        }
        
        // Create MIKO mint with transfer fee extension
        let rent = context.banks_client.get_rent().await.unwrap();
        let space = ExtensionType::try_calculate_account_len::<MintState>(&[ExtensionType::TransferFeeConfig]).unwrap();
        
        context.banks_client.process_transaction(
            Transaction::new_signed_with_payer(
                &[
                    system_instruction::create_account(
                        &context.payer.pubkey(),
                        &mint.pubkey(),
                        rent.minimum_balance(space),
                        space as u64,
                        &spl_token_2022::id(),
                    ),
                ],
                Some(&context.payer.pubkey()),
                &[&context.payer, &mint],
                context.last_blockhash,
            ),
        ).await.unwrap();
        
        // Initialize mint with transfer fee
        let transfer_fee_config = TransferFeeConfig {
            transfer_fee_config_authority: None.try_into().unwrap(),
            withdraw_withheld_authority: Some(authority.pubkey()).try_into().unwrap(),
            withheld_amount: 0u64.into(),
            older_transfer_fee: TransferFee {
                epoch: 0,
                maximum_fee: MAX_FEE.into(),
                transfer_fee_basis_points: FEE_BASIS_POINTS.into(),
            },
            newer_transfer_fee: TransferFee {
                epoch: 0,
                maximum_fee: MAX_FEE.into(),
                transfer_fee_basis_points: FEE_BASIS_POINTS.into(),
            },
        };
        
        // TODO: Initialize transfer fee extension
        // This would require calling the appropriate Token-2022 instruction
        
        // Calculate PDAs
        let (vault_pda, _) = Pubkey::find_program_address(
            &[b"vault_state"],
            &absolute_vault::id(),
        );
        
        let (treasury_vault, _) = Pubkey::find_program_address(
            &[b"treasury_vault", mint.pubkey().as_ref()],
            &absolute_vault::id(),
        );
        
        let (owner_vault, _) = Pubkey::find_program_address(
            &[b"owner_vault", mint.pubkey().as_ref()],
            &absolute_vault::id(),
        );
        
        Self {
            program_test,
            context,
            authority,
            keeper,
            treasury,
            owner,
            mint: mint.pubkey(),
            vault_pda,
            treasury_vault,
            owner_vault,
            reward_token: reward_token.pubkey(),
        }
    }
    
    async fn initialize_vault(&mut self) -> Result<()> {
        // Implementation would call the initialize instruction
        Ok(())
    }
    
    async fn initialize_system_exclusions(&mut self) -> Result<()> {
        // Implementation would call the initialize_system_exclusions instruction
        Ok(())
    }
    
    async fn harvest_fees(&mut self, accounts: Vec<Pubkey>) -> Result<()> {
        // Implementation would call the harvest_fees instruction
        Ok(())
    }
    
    async fn distribute_rewards(&mut self, holders: Vec<Pubkey>) -> Result<()> {
        // Implementation would call the distribute_rewards instruction
        Ok(())
    }
    
    async fn manage_exclusion(
        &mut self,
        wallet: &Pubkey,
        action: ExclusionAction,
        exclusion_type: ExclusionType,
    ) -> Result<()> {
        // Implementation would call the manage_exclusions instruction
        Ok(())
    }
    
    async fn update_authority(&mut self, new_authority: &Pubkey) -> Result<()> {
        // Implementation would call the update_config instruction
        Ok(())
    }
    
    async fn emergency_withdraw_vault(&mut self, amount: u64) -> Result<()> {
        // Implementation would call the emergency_withdraw_vault instruction
        Ok(())
    }
    
    async fn get_vault_state(&mut self) -> VaultState {
        // Implementation would fetch and deserialize vault state
        VaultState::default()
    }
    
    async fn check_exclusion(&mut self, wallet: &Pubkey) -> Option<ExclusionEntry> {
        // Implementation would fetch exclusion entry
        None
    }
    
    async fn create_token_account(&mut self, owner: &Pubkey, amount: u64) {
        // Implementation would create a token account with balance
    }
    
    async fn create_token_account_with_fees(&mut self, owner: &Pubkey, withheld_amount: u64) {
        // Implementation would create a token account with withheld fees
    }
    
    async fn add_rewards_to_vault(&mut self, amount: u64) {
        // Implementation would add funds to vault accounts
    }
    
    async fn get_token_account(&mut self, owner: &Pubkey) -> TokenAccountState {
        // Implementation would fetch token account state
        TokenAccountState::default()
    }
    
    async fn get_token_balance(&mut self, owner: &Pubkey) -> u64 {
        // Implementation would fetch token balance
        0
    }
    
    async fn get_sol_balance(&mut self, owner: &Pubkey) -> u64 {
        // Implementation would fetch SOL balance
        0
    }
}