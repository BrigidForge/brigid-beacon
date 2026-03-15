/**
 * Structured logging for indexer and notification layer.
 */

type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, msg: string, data?: Record<string, unknown>) {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...data,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info(msg: string, data?: Record<string, unknown>) {
    emit('info', msg, data);
  },
  warn(msg: string, data?: Record<string, unknown>) {
    emit('warn', msg, data);
  },
  error(msg: string, data?: Record<string, unknown>) {
    emit('error', msg, data);
  },
};
