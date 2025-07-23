import { Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

const txBase64 = 'AYavTQkwXAfo4T7j+0otKd2euz7kxRZBw/FSIZAOSADsoqftc1EIZbj/CKPgri64PI6KGXKUHfQ9p/kBAIN5AgaAAQAECqahaqEYUIyODwCo2CuKyFHOg2630Hi33prwJFjIRa6xth2JzlwnxJnDMHMAHzlx3M6/qFm53S79Dbs+kiE14fxP2L9vYltciRSIB4CHRSb++Kk/l0cNVxVjrVd58ybFRgtJ+YFt3jSXwP48SNL/bn3vMVOFF2GDsBhoXoP3HGrLF+zCEZ0WsHQVA0Set7OoyafUo+07UzusVfcvTdEJ/enp22wiSCbxEKOYitGhYYC1tvXAPCfPLQvm8edWZflmAQMGRm/lIRcy/+ytunLDm+e8jOW7xfcSayxDmzpAAAAApdXKngTPXbWQtxS6L+MssVkTP8HBkrciV/0H05ywQB4Gm4hX/quBhPtof2NGGMA12sQ53BrrO1WYoPAAAAAAAe+yErYccyFx2MrI2vyUXcTFnzngFDgzHsTzuNkzC6tvGtK2BQWLIvSYYtiv7q4aEv6kvTTwWOqx1Ly8gjeLhwgDBgAJAxAnAAAAAAAABgAFAsAnCQAHDQAKAQgJAgMEBQsMDQ4g6ZLRjs9oQLwAAAAAAAAAABAnAAAAAAAAAAAAAAAAAAABjsYA8pzFnlrYt+4SwjzHO3pbiRRiRs3w8L+AY63zEnUABSUBAgAF';

async function decodeTx() {
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  
  try {
    // Decode base64 to buffer
    const buffer = Buffer.from(txBase64, 'base64');
    
    // Try to deserialize as versioned transaction
    const tx = VersionedTransaction.deserialize(buffer);
    
    console.log('Transaction Version:', tx.version);
    console.log('\nStatic Account Keys:');
    tx.message.staticAccountKeys.forEach((key, i) => {
      console.log(`  [${i}] ${key.toBase58()}`);
    });
    
    console.log('\nAddress Lookup Tables:');
    if (tx.message.addressTableLookups && tx.message.addressTableLookups.length > 0) {
      tx.message.addressTableLookups.forEach((lookup, i) => {
        console.log(`  ALT ${i}: ${lookup.accountKey.toBase58()}`);
        console.log(`    Write indexes: [${lookup.writableIndexes.join(', ')}]`);
        console.log(`    Read indexes: [${lookup.readonlyIndexes.join(', ')}]`);
      });
    } else {
      console.log('  None');
    }
    
    console.log('\nInstructions:');
    tx.message.compiledInstructions.forEach((ix, i) => {
      const programIdIndex = ix.programIdIndex;
      const programId = tx.message.staticAccountKeys[programIdIndex];
      console.log(`\nInstruction ${i}:`);
      console.log(`  Program: [${programIdIndex}] ${programId.toBase58()}`);
      console.log(`  Account indexes: [${ix.accountKeyIndexes.join(', ')}]`);
      console.log(`  Data (hex): ${Buffer.from(ix.data).toString('hex')}`);
      
      // Show which accounts are referenced
      console.log('  Accounts:');
      ix.accountKeyIndexes.forEach(idx => {
        if (idx < tx.message.staticAccountKeys.length) {
          console.log(`    [${idx}] ${tx.message.staticAccountKeys[idx].toBase58()} (static)`);
        } else {
          console.log(`    [${idx}] (from ALT)`);
        }
      });
    });
    
  } catch (error) {
    console.error('Error decoding transaction:', error);
  }
}

decodeTx();