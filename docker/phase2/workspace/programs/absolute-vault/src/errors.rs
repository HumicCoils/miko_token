use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Invalid authority")]
    InvalidAuthority,
    
    #[msg("Invalid treasury")]
    InvalidTreasury,
    
    #[msg("Invalid owner wallet")]
    InvalidOwnerWallet,
    
    #[msg("Invalid token mint")]
    InvalidTokenMint,
    
    #[msg("Minimum hold amount too low")]
    MinHoldAmountTooLow,
    
    #[msg("Exclusion list full")]
    ExclusionListFull,
    
    #[msg("Address already excluded")]
    AddressAlreadyExcluded,
    
    #[msg("Address not excluded")]
    AddressNotExcluded,
    
    #[msg("Invalid exclusion type")]
    InvalidExclusionType,
    
    #[msg("Insufficient SOL balance")]
    InsufficientSolBalance,
    
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    
    #[msg("Invalid holder count")]
    InvalidHolderCount,
    
    #[msg("No eligible holders")]
    NoEligibleHolders,
    
    #[msg("Distribution amount too small")]
    DistributionAmountTooSmall,
    
    #[msg("Vault not initialized")]
    VaultNotInitialized,
    
    #[msg("Invalid PDA derivation")]
    InvalidPdaDerivation,
}
