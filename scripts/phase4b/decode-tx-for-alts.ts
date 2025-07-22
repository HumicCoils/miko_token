import { Connection, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

async function decodeTransactionForALTs() {
  // The failed transaction from the error
  const txBase64 = 'Ad92Yy0v30+HpUEACT5C03lW881Fz03HTQy5BUMU18x6p/Zzag6SUieAvpMrUo0qErNf71lBPjXRaHcjpykyQQKAAQAECs8c7ALbaBvsYq5/KxDOn2H7JJinZS6kNApN6Y6zKmCHO4OPJQ836wOTbXWCRBHatf2EHXCFSVuuvmM0pXPLwwAjo0qurCbW1rM1WZuVtk9P6Z9481CsUjeyGI7FZAykCO3nd3YL27Ekl0vE1x7xtaQSRv9KEfC18QgBmRksHLKWWfiUZ15DGb6NUqDzkMct8yzvzXiobr3vtEa2R3WPdQyKvv5VFpBE7Nc28AOGqvi7R7fYh2olcqOq/Fl8ZJrBpQMGRm/lIRcy/+ytunLDm+e8jOW7xfcSayxDmzpAAAAApdXKngTPXbWQtxS6L+MssVkTP8HBkrciV/0H05ywQB4Gm4hX/quBhPtof2NGGMA12sQ53BrrO1WYoPAAAAAAAfDRzzWjo+3XncTcL9MAhpzxNytyVaV4Se45CRLnwlzOoEicfAORh2Nk9L36okD5ApiaByluRPacwFvQ06DNOaYDBgAJAxAnAAAAAAAABgAFAsAnCQAHDQAKAQgJAgMEBQsMDQ4g6ZLRjs9oQLwAAAAAAAAAABAnAAAAAAAAAAAAAAAAAAABjsYA8pzFnlrYt+4SwjzHO3pbiRRiRs3w8L+AY63zEnUABSUBAgAF';
  
  try {
    // Decode base64 to buffer
    const txBuffer = Buffer.from(txBase64, 'base64');
    
    // Deserialize as VersionedTransaction
    const tx = VersionedTransaction.deserialize(txBuffer);
    
    console.log('Transaction version:', tx.version);
    console.log('Number of signatures:', tx.signatures.length);
    
    // Check if it's a V0 transaction (uses ALTs)
    if (tx.version === 0) {
      console.log('\nThis is a V0 transaction that uses Address Lookup Tables');
      
      // Get ALT addresses
      const message = tx.message;
      if ('addressTableLookups' in message && message.addressTableLookups) {
        console.log('\nAddress Lookup Tables used:');
        for (const lookup of message.addressTableLookups) {
          console.log(`- ALT: ${lookup.accountKey.toBase58()}`);
          console.log(`  - Write indexes: ${lookup.writableIndexes}`);
          console.log(`  - Read indexes: ${lookup.readonlyIndexes}`);
        }
      }
      
      // Also show static account keys
      console.log('\nStatic account keys:');
      message.staticAccountKeys.forEach((key, i) => {
        console.log(`${i}: ${key.toBase58()}`);
      });
    }
    
  } catch (error) {
    console.error('Failed to decode transaction:', error);
  }
}

decodeTransactionForALTs();