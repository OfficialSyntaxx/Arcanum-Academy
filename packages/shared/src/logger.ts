/**
 * Structured logging with a pluggable sink.
 *
 * Log records are objects, not strings, so the same call site feeds the dev
 * console, the analytics pipeline and the server's JSON log without reformatting.
 */

export const LogLevel = {
  Debug: 10,
  Info: 20,
  Warn: 30,
  Error: 40,
  Silent: 100,
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export interface LogRecord {
  readonly level: LogLevel;
  readonly scope: string;
  readonly message: string;
  readonly time: number;
  readonly data?: Readonly<Record<string, unknown>>;
}

export type LogSink = (record: LogRecord) => void;

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  child(scope: string): Logger;
}

export const consoleSink: LogSink = (record) => {
  const prefix = `[${record.scope}]`;
  if (record.level >= LogLevel.Error) console.error(prefix, record.message, record.data ?? '');
  else if (record.level >= LogLevel.Warn) console.warn(prefix, record.message, record.data ?? '');
  else if (record.level >= LogLevel.Info) console.info(prefix, record.message, record.data ?? '');
  else console.debug(prefix, record.message, record.data ?? '');
};

/** Captures records in memory. Used by the in-game debug overlay and by tests. */
export function createMemorySink(limit = 500): LogSink & { records: LogRecord[] } {
  const records: LogRecord[] = [];
  const sink = ((record: LogRecord) => {
    records.push(record);
    if (records.length > limit) records.shift();
  }) as LogSink & { records: LogRecord[] };
  sink.records = records;
  return sink;
}

export function createLogger(options: {
  scope: string;
  level?: LogLevel;
  sinks?: LogSink[];
  now?: () => number;
}): Logger {
  const level = options.level ?? LogLevel.Info;
  const sinks = options.sinks ?? [consoleSink];
  const now = options.now ?? (() => Date.now());

  const write = (recordLevel: LogLevel, message: string, data?: Record<string, unknown>): void => {
    if (recordLevel < level) return;
    const record: LogRecord = {
      level: recordLevel,
      scope: options.scope,
      message,
      time: now(),
      ...(data === undefined ? {} : { data }),
    };
    for (const sink of sinks) sink(record);
  };

  return {
    debug: (message, data) => write(LogLevel.Debug, message, data),
    info: (message, data) => write(LogLevel.Info, message, data),
    warn: (message, data) => write(LogLevel.Warn, message, data),
    error: (message, data) => write(LogLevel.Error, message, data),
    child: (scope) => createLogger({ scope: `${options.scope}:${scope}`, level, sinks, now }),
  };
}
