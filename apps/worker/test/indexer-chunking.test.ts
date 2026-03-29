import test from 'node:test';
import assert from 'node:assert/strict';
import { isBlockRangeTooLargeError, MIN_BLOCK_CHUNK_SIZE, shrinkBlockChunkSize } from '../src/indexer-chunking.js';

test('isBlockRangeTooLargeError recognizes provider range-limit errors', () => {
  assert.equal(
    isBlockRangeTooLargeError(new Error('could not coalesce error (error={ "code": -32062, "message": "Block range is too large" })')),
    true,
  );
  assert.equal(isBlockRangeTooLargeError(new Error('socket hang up')), false);
});

test('shrinkBlockChunkSize halves the chunk size and respects the minimum floor', () => {
  assert.equal(shrinkBlockChunkSize(5_000), 2_500);
  assert.equal(shrinkBlockChunkSize(250), 125);
  assert.equal(shrinkBlockChunkSize(MIN_BLOCK_CHUNK_SIZE), MIN_BLOCK_CHUNK_SIZE);
});
