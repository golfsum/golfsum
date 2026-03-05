import { Platform } from 'react-native';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type Logger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

type ErrorPayload = {
  level: LogLevel;
  message: string;
  name?: string;
  stack?: string;
  args?: string;
  createdAt: string;
};

type ErrorHandler = (payload: ErrorPayload) => void | Promise<void>;
type WarnHandler = (payload: ErrorPayload) => void | Promise<void>;

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
let quietMode = !isDev;
let errorHandler: ErrorHandler | null = null;
let warnHandler: WarnHandler | null = null;
const REMOTE_RATE_LIMIT_MS = 5000;
const lastRemoteSend = new Map<string, number>();

const isRateLimited = (key: string): boolean => {
  const last = lastRemoteSend.get(key);
  return !!last && Date.now() - last < REMOTE_RATE_LIMIT_MS;
};

const markRemoteSent = (key: string): void => {
  lastRemoteSend.set(key, Date.now());
  if (lastRemoteSend.size > 100) {
    const oldest = [...lastRemoteSend.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, 50)
      .map(([k]) => k);
    oldest.forEach(k => lastRemoteSend.delete(k));
  }
};

const safeStringify = (value: unknown, maxLength = 4000) => {
  try {
    const raw = JSON.stringify(value);
    if (raw && raw.length > maxLength) return `${raw.slice(0, maxLength)}…`;
    return raw;
  } catch {
    return String(value);
  }
};

const extractErrorPayload = (level: LogLevel, args: unknown[]): ErrorPayload => {
  const createdAt = new Date().toISOString();
  const errorArg = args.find((arg) => arg instanceof Error) as Error | undefined;
  const plainObjArg = args.find(
    (arg) => arg && typeof arg === 'object' && 'message' in (arg as any)
  ) as { message?: unknown; stack?: unknown; name?: unknown } | undefined;
  const messageFromArgs = args
    .map((arg) => (typeof arg === 'string' ? arg : undefined))
    .filter(Boolean)
    .join(' ');

  if (errorArg) {
    return {
      level,
      message: errorArg.message || messageFromArgs || 'Unknown error',
      name: errorArg.name,
      stack: errorArg.stack,
      args: safeStringify(args),
      createdAt,
    };
  }

  if (plainObjArg?.message) {
    return {
      level,
      message: String(plainObjArg.message),
      name: plainObjArg?.name ? String(plainObjArg.name) : undefined,
      stack: plainObjArg?.stack ? String(plainObjArg.stack) : undefined,
      args: safeStringify(args),
      createdAt,
    };
  }

  return {
    level,
    message: messageFromArgs || 'Unknown error',
    args: safeStringify(args),
    createdAt,
  };
};

const log = (level: LogLevel, ...args: unknown[]) => {
  if (level === 'error' && errorHandler) {
    try {
      const payload = extractErrorPayload(level, args);
      const key = `error:${payload.message}`;
      if (!isRateLimited(key)) {
        markRemoteSent(key);
        void errorHandler(payload);
      }
    } catch {
      // Never throw from logger
    }
  }

  if (level === 'warn' && warnHandler) {
    try {
      const payload = extractErrorPayload(level, args);
      const key = `warn:${payload.message}`;
      if (!isRateLimited(key)) {
        markRemoteSent(key);
        void warnHandler(payload);
      }
    } catch {
      // Never throw from logger
    }
  }

  if (quietMode) return;
  if (level === 'debug' && !isDev) return;
  if (level === 'info' && !isDev) return;

  switch (level) {
    case 'debug':
      console.log(...args);
      break;
    case 'info':
      console.log(...args);
      break;
    case 'warn':
      console.warn(...args);
      break;
    case 'error':
      console.error(...args);
      break;
  }
};

export const logger: Logger = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
};

export const setLoggerQuietMode = (enabled: boolean) => {
  quietMode = enabled;
};

export const setLoggerErrorHandler = (handler: ErrorHandler | null) => {
  errorHandler = handler;
};

export const setLoggerWarnHandler = (handler: WarnHandler | null) => {
  warnHandler = handler;
};

export const _getRateLimitMapSize = () => lastRemoteSend.size;
export const _clearRateLimitMap = () => lastRemoteSend.clear();

export const logPlatform = () => {
  if (!isDev) return;
  logger.debug('Platform:', Platform.OS);
};
