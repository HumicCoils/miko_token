import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@project-serum/anchor';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';
import { config } from '../config';

export async function loadPrograms(connection: Connection, wallet: Keypair) {
  const provider = new AnchorProvider(
    connection,
    new Wallet(wallet),
    { commitment: config.COMMITMENT_LEVEL }
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
    new PublicKey(config.ABSOLUTE_VAULT_PROGRAM),
    provider
  );
  
  const smartDial = new Program(
    smartDialIdl,
    new PublicKey(config.SMART_DIAL_PROGRAM),
    provider
  );

  logger.info('Programs loaded successfully');
  
  return {
    absoluteVault,
    smartDial,
  };
}