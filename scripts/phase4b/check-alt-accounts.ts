import { Connection, PublicKey, AddressLookupTableAccount } from '@solana/web3.js';

async function checkALT() {
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  const altAddress = new PublicKey('AcL1Vo8oy1ULiavEcjSUcwfBSForXMudcZvDZy5nzJkU');
  
  try {
    // Fetch the ALT account
    const altAccount = await connection.getAddressLookupTable(altAddress);
    
    if (!altAccount.value) {
      console.log('ALT not found');
      return;
    }
    
    const alt = altAccount.value;
    console.log('ALT:', altAddress.toBase58());
    console.log('State:', alt.state);
    console.log('Total addresses:', alt.state.addresses.length);
    
    // Show the specific indexes we care about from the transaction
    const indexes = [37, 1, 2, 0, 5];
    console.log('\nAddresses at indexes used in transaction:');
    indexes.forEach(idx => {
      if (idx < alt.state.addresses.length) {
        console.log(`  [${idx}] ${alt.state.addresses[idx].toBase58()}`);
      } else {
        console.log(`  [${idx}] OUT OF BOUNDS`);
      }
    });
    
    // Show all addresses for debugging
    console.log('\nAll addresses in ALT:');
    alt.state.addresses.forEach((addr, i) => {
      console.log(`  [${i}] ${addr.toBase58()}`);
    });
    
  } catch (error) {
    console.error('Error fetching ALT:', error);
  }
}

checkALT();