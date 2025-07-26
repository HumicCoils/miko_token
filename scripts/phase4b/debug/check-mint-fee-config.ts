import { Connection, PublicKey } from '@solana/web3.js';
import { getMint, getTransferFeeConfig, unpackMint, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { ConfigManager } from '../config-manager';

async function checkMintFeeConfig() {
  const configManager = new ConfigManager('../minimal-config.json');
  const config = await configManager.getFullConfig();
  const connection = new Connection(config.network.rpc_url, 'confirmed');
  
  const mintPubkey = new PublicKey(config.token.mint_address);
  
  console.log('=== MIKO Token Mint Fee Configuration ===');
  console.log('Mint Address:', mintPubkey.toBase58());
  console.log('');
  
  try {
    // Get mint info using the SDK with Token-2022 program
    const mintInfo = await getMint(connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log('Total Supply:', Number(mintInfo.supply) / 1e9, 'MIKO');
    console.log('Decimals:', mintInfo.decimals);
    console.log('');
    
    // Get raw account data to parse fee config
    const accountInfo = await connection.getAccountInfo(mintPubkey);
    if (!accountInfo) {
      console.error('Mint account not found');
      return;
    }
    
    // Parse the mint data manually to find TransferFeeConfig extension
    const data = accountInfo.data;
    
    // Token-2022 mint layout:
    // - Base mint data: 82 bytes
    // - Extension discriminator: 2 bytes (should be 1 for valid extension)
    // - Account type: 2 bytes  
    // - Extensions follow
    
    console.log('=== Parsing Token Extensions ===');
    console.log('Data length:', data.length, 'bytes');
    
    // Let's check the raw data
    console.log('\nRaw data at key offsets:');
    console.log('Offset 82-83 (extension discriminator):', data.readUInt16LE(82));
    console.log('Offset 84 (account type):', data[84]);
    console.log('Offset 165-166:', data.readUInt16LE(165));
    console.log('Offset 167-168:', data.readUInt16LE(167));
    
    // Try using the SDK to get transfer fee config
    console.log('\n=== Using SDK to get Transfer Fee Config ===');
    try {
      const transferFeeConfig = getTransferFeeConfig(mintInfo);
      if (transferFeeConfig) {
        console.log('✅ Transfer Fee Config found via SDK!');
        console.log('Transfer Fee Authority:', transferFeeConfig.transferFeeConfigAuthority?.toBase58() || 'None');
        console.log('Withdraw Authority:', transferFeeConfig.withdrawWithheldAuthority?.toBase58() || 'None');
        console.log('Withheld Amount:', Number(transferFeeConfig.withheldAmount) / 1e9, 'MIKO');
        
        console.log('\nOlder Transfer Fee:');
        console.log('  Epoch:', transferFeeConfig.olderTransferFee.epoch.toString());
        console.log('  Transfer Fee Basis Points:', transferFeeConfig.olderTransferFee.transferFeeBasisPoints, '(', transferFeeConfig.olderTransferFee.transferFeeBasisPoints / 100, '%)');
        console.log('  Maximum Fee:', Number(transferFeeConfig.olderTransferFee.maximumFee) / 1e9, 'MIKO');
        
        console.log('\nNewer Transfer Fee:');
        console.log('  Epoch:', transferFeeConfig.newerTransferFee.epoch.toString());
        console.log('  Transfer Fee Basis Points:', transferFeeConfig.newerTransferFee.transferFeeBasisPoints, '(', transferFeeConfig.newerTransferFee.transferFeeBasisPoints / 100, '%)');
        console.log('  Maximum Fee:', Number(transferFeeConfig.newerTransferFee.maximumFee) / 1e9, 'MIKO');
        
        // Check if maximum fee is set
        if (transferFeeConfig.olderTransferFee.maximumFee > 0 || transferFeeConfig.newerTransferFee.maximumFee > 0) {
          console.log('\n⚠️  WARNING: MAXIMUM FEE IS SET!');
          
          const epochInfo = await connection.getEpochInfo();
          const activeMaxFee = epochInfo.epoch >= Number(transferFeeConfig.newerTransferFee.epoch) 
            ? transferFeeConfig.newerTransferFee.maximumFee 
            : transferFeeConfig.olderTransferFee.maximumFee;
          const activeRate = epochInfo.epoch >= Number(transferFeeConfig.newerTransferFee.epoch)
            ? transferFeeConfig.newerTransferFee.transferFeeBasisPoints
            : transferFeeConfig.olderTransferFee.transferFeeBasisPoints;
            
          console.log('\n🔴 ACTIVE CONFIGURATION:');
          console.log('  Current Epoch:', epochInfo.epoch);
          console.log('  Active Maximum Fee:', Number(activeMaxFee) / 1e9, 'MIKO');
          console.log('  Active Rate:', activeRate / 100, '%');
          
          if (activeMaxFee > 0) {
            const capThreshold = Number(activeMaxFee) * 10000 / activeRate / 1e9;
            console.log('  Fee cap applies to transfers over:', capThreshold.toFixed(2), 'MIKO');
          }
        }
      } else {
        console.log('❌ No Transfer Fee Config found via SDK');
      }
    } catch (error) {
      console.log('Error getting transfer fee config:', error);
    }
    
    // Also try to manually parse at different offsets
    console.log('\n=== Manual parsing attempt ===');
    
    // Read account type
    const accountType = data[84];
    console.log('Account type:', accountType, '(1 = Mint)');
    
    // Extensions start at offset 85
    let offset = 85;
    let foundTransferFeeConfig = false;
    let extensionCount = 0;
    
    // Extension types
    const EXTENSION_TYPES: {[key: number]: string} = {
      0: 'Uninitialized',
      1: 'TransferFeeConfig',
      2: 'TransferFeeAmount', 
      3: 'MintCloseAuthority',
      4: 'ConfidentialTransferMint',
      5: 'ConfidentialTransferAccount',
      6: 'DefaultAccountState',
      7: 'ImmutableOwner',
      8: 'MemoTransfer',
      9: 'NonTransferable',
      10: 'InterestBearingConfig',
      11: 'CpiGuard',
      12: 'PermanentDelegate',
      13: 'NonTransferableAccount',
      14: 'TransferHook',
      15: 'TransferHookAccount',
      16: 'ConfidentialTransferFeeConfig',
      17: 'ConfidentialTransferFeeAmount',
      18: 'MetadataPointer',
      19: 'TokenMetadata',
      20: 'GroupPointer',
      21: 'TokenGroup',
      22: 'GroupMemberPointer',
      23: 'TokenGroupMember'
    };
    
    console.log('\nExtensions found:');
    
    while (offset < data.length - 4) {
      // Read extension type (2 bytes) and length (2 bytes)
      const extensionType = data.readUInt16LE(offset);
      const extensionLen = data.readUInt16LE(offset + 2);
      
      const extensionName = EXTENSION_TYPES[extensionType] || 'Unknown';
      console.log(`${++extensionCount}. ${extensionName} (type=${extensionType}, length=${extensionLen} bytes)`);
      
      // TransferFeeConfig has type 1
      if (extensionType === 1) {
        foundTransferFeeConfig = true;
        console.log('\n✅ Found TransferFeeConfig extension!');
        
        const configOffset = offset + 4;
        
        // TransferFeeConfig layout:
        // - transferFeeConfigAuthority: 33 bytes (1 + 32)
        // - withdrawWithheldAuthority: 33 bytes (1 + 32)
        // - withheldAmount: 8 bytes (u64)
        // - olderTransferFee: TransferFee (8 + 2 + 8 = 18 bytes)
        // - newerTransferFee: TransferFee (8 + 2 + 8 = 18 bytes)
        
        // Read authorities
        const hasTransferFeeConfigAuth = data[configOffset] === 1;
        const transferFeeConfigAuth = hasTransferFeeConfigAuth 
          ? new PublicKey(data.subarray(configOffset + 1, configOffset + 33))
          : null;
          
        const hasWithdrawAuth = data[configOffset + 33] === 1;
        const withdrawAuth = hasWithdrawAuth
          ? new PublicKey(data.subarray(configOffset + 34, configOffset + 66))
          : null;
          
        // Read withheld amount
        const withheldAmount = data.readBigUInt64LE(configOffset + 66);
        
        // Read older transfer fee
        const olderFeeOffset = configOffset + 74;
        const olderEpoch = data.readBigUInt64LE(olderFeeOffset);
        const olderFeeBasisPoints = data.readUInt16LE(olderFeeOffset + 8);
        const olderMaxFee = data.readBigUInt64LE(olderFeeOffset + 10);
        
        // Read newer transfer fee  
        const newerFeeOffset = olderFeeOffset + 18;
        const newerEpoch = data.readBigUInt64LE(newerFeeOffset);
        const newerFeeBasisPoints = data.readUInt16LE(newerFeeOffset + 8);
        const newerMaxFee = data.readBigUInt64LE(newerFeeOffset + 10);
        
        console.log('\nAuthorities:');
        console.log('  Transfer Fee Config Authority:', transferFeeConfigAuth?.toBase58() || 'None');
        console.log('  Withdraw Withheld Authority:', withdrawAuth?.toBase58() || 'None');
        console.log('  Withheld Amount:', Number(withheldAmount) / 1e9, 'MIKO');
        
        console.log('\nOlder Transfer Fee (Epoch', olderEpoch.toString(), '):');
        console.log('  Fee Rate:', olderFeeBasisPoints, 'basis points (', olderFeeBasisPoints / 100, '%)', );
        console.log('  Maximum Fee:', Number(olderMaxFee) / 1e9, 'MIKO');
        if (olderMaxFee > 0) {
          console.log('  ⚠️  MAXIMUM FEE IS SET!');
        }
        
        console.log('\nNewer Transfer Fee (Epoch', newerEpoch.toString(), '):');
        console.log('  Fee Rate:', newerFeeBasisPoints, 'basis points (', newerFeeBasisPoints / 100, '%)');
        console.log('  Maximum Fee:', Number(newerMaxFee) / 1e9, 'MIKO');
        if (newerMaxFee > 0) {
          console.log('  ⚠️  MAXIMUM FEE IS SET!');
        }
        
        // Get current epoch for reference
        const epochInfo = await connection.getEpochInfo();
        console.log('\nCurrent Epoch:', epochInfo.epoch);
        
        // Determine which fee is active
        const activeFee = epochInfo.epoch >= Number(newerEpoch) ? 'Newer' : 'Older';
        const activeMaxFee = epochInfo.epoch >= Number(newerEpoch) ? newerMaxFee : olderMaxFee;
        const activeRate = epochInfo.epoch >= Number(newerEpoch) ? newerFeeBasisPoints : olderFeeBasisPoints;
        
        console.log('\n🔴 ACTIVE FEE CONFIGURATION:');
        console.log('  Active Fee Set:', activeFee);
        console.log('  Current Fee Rate:', activeRate / 100, '%');
        console.log('  Current Maximum Fee:', Number(activeMaxFee) / 1e9, 'MIKO');
        
        if (activeMaxFee > 0) {
          console.log('\n⚠️  WARNING: Maximum fee is currently active at', Number(activeMaxFee) / 1e9, 'MIKO');
          console.log('  This means transfers will be capped at this amount regardless of percentage!');
          
          // Calculate at what transfer amount the cap kicks in
          const capThreshold = Number(activeMaxFee) * 10000 / activeRate / 1e9;
          console.log('  Fee cap applies to transfers over:', capThreshold.toFixed(2), 'MIKO');
        }
        
        break;
      }
      
      // Move to next extension
      offset += 4 + extensionLen;
    }
    
    if (!foundTransferFeeConfig) {
      console.log('\n❌ No TransferFeeConfig extension found!');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkMintFeeConfig().catch(console.error);