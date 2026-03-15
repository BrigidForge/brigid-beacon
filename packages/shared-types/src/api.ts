/**
 * API response contracts for Beacon.
 * Matches BEACON_MVP_SPEC §6.
 */

import type { VaultStatus } from './status.js';
import type { NormalizedEvent } from './events.js';

export interface VaultMetadata {
  address: string;
  chainId: number;
  owner: string;
  token: string;
  totalAllocation: string;
  startTime: string;
  cliffDuration: string;
  intervalDuration: string;
  intervalCount: string;
  cancelWindow: string;
  withdrawalDelay: string;
  executionWindow: string;
  createdAt: string;
  deployedAtBlock: number;
  deployedAtTx: string;
}

export type { VaultStatus };

export interface VaultEventsResponse {
  events: NormalizedEvent[];
}

export interface DeploymentProofConfig {
  token: string;
  owner: string;
  totalAllocation: string;
  startTime: string;
  cliffDuration: string;
  intervalDuration: string;
  intervalCount: string;
  cancelWindow: string;
  withdrawalDelay: string;
  executionWindow: string;
}

export interface DeploymentProof {
  vault: string;
  chainId: number;
  factory: string;
  deployer: string;
  blockNumber: number;
  transactionHash: string;
  config: DeploymentProofConfig;
}
