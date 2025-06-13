# Testing Swap Functionality on Devnet via Simulation

## 1. The Challenge

A core part of the MIKO reward cycle is swapping the collected MIKO tax tokens into the designated reward token. This project uses the Jupiter API for this task. However, the Jupiter v6 API is optimized for mainnet and does not officially support the devnet environment.

This makes it impossible to test the full end-to-end reward cycle on devnet, as the swap step will always fail.

## 2. The Solution: Swap Simulation (Mocking)

The recommended solution is to **simulate** a successful swap when the keeper bot is running in a development or test environment. Instead of calling the Jupiter API, the bot will pretend the swap occurred successfully and proceed with the rest of the logic.

This approach is ideal because the primary goal on devnet is to test your system's custom logic (e.g., distributing tokens to eligible holders), not to test Jupiter's API itself.

## 3. Implementation Steps

### Step 1: Manually Fund the Treasury with Reward Tokens

This is a critical prerequisite. Since no actual swap will occur on devnet, the `treasury_wallet` must be pre-funded with the reward tokens you intend to distribute.

For example, if you plan to test with devnet USDC as the reward token, mint or acquire some devnet USDC and transfer it to the project's treasury wallet before starting the test.

### Step 2: Modify the Keeper Bot Code

In the `keeper-bot/src/orchestration/RewardOrchestrator.ts` file, modify the `swapTaxToRewardToken` function to include a conditional block for the development environment.

```typescript
// in keeper-bot/src/orchestration/RewardOrchestrator.ts

private async swapTaxToRewardToken(
    rewardToken: PublicKey,
    amount: number
): Promise<{ success: boolean; outputAmount: number; error?: string }> {
    
    // Check if running in a development environment
    if (process.env.NODE_ENV === 'development') {
        logger.warn('DEVNET MODE: Simulating swap. No actual transaction will be sent.');

        // For the simulation to work, the treasury wallet must already be funded
        // with the reward tokens that are supposed to be distributed.

        // We can invent a plausible output amount for logging and logic continuity.
        // For example, assume a 99% swap efficiency.
        const simulatedOutputAmount = amount * 0.99;

        // Return a successful result without making any API calls.
        return { success: true, outputAmount: simulatedOutputAmount };
    }

    // --- The original production logic remains below ---
    try {
        const inputAmount = Math.floor(amount * 1e9);
        const quote = await this.jupiterClient.getQuote(
            config.MIKO_TOKEN_MINT,
            rewardToken,
            inputAmount
        );
        // ... rest of the production swap logic
    } catch (error) {
        // ... error handling
    }
}

## 4. Conclusion

By simulating the swap, you decouple your system from external dependencies that are unavailable on devnet. This allows you to perform stable, predictable, and efficient end-to-end tests of your core reward distribution logic before moving to mainnet. This is a standard and professional approach to testing complex systems.
