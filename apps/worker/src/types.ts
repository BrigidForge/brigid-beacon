export interface ContractLog {
  blockNumber: number;
  transactionHash: string;
  index: number;
  address: string;
  topics: string[];
  data: string;
}

export interface FactoryDeployedLog {
  deployer: string;
  vault: string;
  token: string;
  owner: string;
  totalAllocation: bigint;
  startTime: bigint;
  cliff: bigint;
  interval: bigint;
  intervals: bigint;
  cancelWindow: bigint;
  withdrawalDelay: bigint;
  executionWindow: bigint;
}
