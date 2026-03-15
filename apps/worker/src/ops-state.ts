import { prisma } from './db.js';
import { config } from './config.js';

export async function markIndexerSuccess(params: {
  discoveryMode: 'registry' | 'event_only';
  errorMessage?: null;
}) {
  await prisma.indexerState.upsert({
    where: { id: config.indexerStateId },
    create: {
      id: config.indexerStateId,
      lastIndexerRunAt: new Date(),
      discoveryMode: params.discoveryMode,
      lastErrorAt: null,
      lastErrorMessage: null,
    },
    update: {
      lastIndexerRunAt: new Date(),
      discoveryMode: params.discoveryMode,
      lastErrorAt: null,
      lastErrorMessage: null,
    },
  });
}

export async function markIndexerError(message: string) {
  await prisma.indexerState.upsert({
    where: { id: config.indexerStateId },
    create: {
      id: config.indexerStateId,
      lastIndexerRunAt: new Date(),
      lastErrorAt: new Date(),
      lastErrorMessage: message,
    },
    update: {
      lastIndexerRunAt: new Date(),
      lastErrorAt: new Date(),
      lastErrorMessage: message,
    },
  });
}

export async function markDispatcherRun() {
  await prisma.indexerState.upsert({
    where: { id: config.indexerStateId },
    create: {
      id: config.indexerStateId,
      lastDispatcherRunAt: new Date(),
    },
    update: {
      lastDispatcherRunAt: new Date(),
    },
  });
}
