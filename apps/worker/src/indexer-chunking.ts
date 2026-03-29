export const MIN_BLOCK_CHUNK_SIZE = 100;

export function isBlockRangeTooLargeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes('block range is too large');
}

export function shrinkBlockChunkSize(blockChunkSize: number): number {
  return Math.max(MIN_BLOCK_CHUNK_SIZE, Math.floor(blockChunkSize / 2));
}
