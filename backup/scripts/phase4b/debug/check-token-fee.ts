import { Connection, PublicKey } from '@solana/web3.js';
import { getMint, getTransferFeeConfig, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

const MIKO_TOKEN = new PublicKey('EkgPtCLLsbWxhdYrCpqWej2ULoytu6QcygpnyFeiT4Gs');

async function checkTokenFee() {
    const connection = new Connection('http://localhost:8899', 'confirmed');
    
    try {
        // Get mint info
        const mintInfo = await getMint(connection, MIKO_TOKEN, 'confirmed', TOKEN_2022_PROGRAM_ID);
        
        // Get transfer fee config
        const transferFeeConfig = getTransferFeeConfig(mintInfo);
        
        if (!transferFeeConfig) {
            console.log('No transfer fee config found!');
            return;
        }
        
        const currentEpoch = await connection.getEpochInfo();
        const currentFee = currentEpoch.epoch >= Number(transferFeeConfig.newerTransferFee.epoch)
            ? transferFeeConfig.newerTransferFee
            : transferFeeConfig.olderTransferFee;
        
        console.log('\nTransfer Fee Configuration:');
        console.log('Current Epoch:', currentEpoch.epoch);
        console.log('\nOlder Fee:');
        console.log('- Epoch:', transferFeeConfig.olderTransferFee.epoch.toString());
        console.log('- Fee BPS:', transferFeeConfig.olderTransferFee.transferFeeBasisPoints);
        console.log('- Fee %:', transferFeeConfig.olderTransferFee.transferFeeBasisPoints / 100 + '%');
        console.log('- Max Fee:', transferFeeConfig.olderTransferFee.maximumFee.toString());
        
        console.log('\nNewer Fee:');
        console.log('- Epoch:', transferFeeConfig.newerTransferFee.epoch.toString());
        console.log('- Fee BPS:', transferFeeConfig.newerTransferFee.transferFeeBasisPoints);
        console.log('- Fee %:', transferFeeConfig.newerTransferFee.transferFeeBasisPoints / 100 + '%');
        console.log('- Max Fee:', transferFeeConfig.newerTransferFee.maximumFee.toString());
        
        console.log('\n✓ Current Active Fee:', currentFee.transferFeeBasisPoints / 100 + '%');
        
        // Calculate expected fee based on launch time
        const fs = require('fs');
        const launchLog = fs.readFileSync('launch-execution.log', 'utf8');
        const lines = launchLog.trim().split('\n');
        if (lines.length > 0) {
            const bootstrap = JSON.parse(lines[0]);
            const launchTime = bootstrap.launchTime;
            const currentTime = Date.now() / 1000;
            const timeSinceLaunch = currentTime - launchTime;
            
            console.log('\n⏱️ Time since launch:', Math.floor(timeSinceLaunch) + 's');
            
            let expectedFee;
            if (timeSinceLaunch < 300) {
                expectedFee = 30;
            } else if (timeSinceLaunch < 600) {
                expectedFee = 15;
            } else {
                expectedFee = 5;
            }
            
            console.log('Expected fee based on time:', expectedFee + '%');
            console.log('Actual fee:', currentFee.transferFeeBasisPoints / 100 + '%');
            
            if (expectedFee !== currentFee.transferFeeBasisPoints / 100) {
                console.log('\n❌ Fee mismatch! The fee should have been updated.');
            } else {
                console.log('\n✅ Fee is correct for the current time.');
            }
        }
        
    } catch (error) {
        console.error('Error:', error);
    }
}

checkTokenFee().catch(console.error);