import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

export async function loadPrograms(connection: Connection, wallet: Keypair) {
  const provider = new AnchorProvider(
    connection,
    new Wallet(wallet),
    { commitment: 'confirmed' }
  );

  // Load IDLs
  const absoluteVaultIdl = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../idl/absolute_vault.json'), 'utf-8')
  );
  
  const smartDialIdl = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../idl/smart_dial.json'), 'utf-8')
  );

  // Create program instances
  const absoluteVault = new Program(
    absoluteVaultIdl,
    new PublicKey(process.env.ABSOLUTE_VAULT_PROGRAM!),
    provider
  );
  
  const smartDial = new Program(
    smartDialIdl,
    new PublicKey(process.env.SMART_DIAL_PROGRAM!),
    provider
  );

  logger.info('Programs loaded successfully');
  
  return {
    absoluteVault,
    smartDial,
  };
}