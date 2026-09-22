// Structured logging via Winston.
// see https://github.com/winstonjs/winston
//
// Production logs JSON to stdout (the container orchestrator captures and
// ships it from there — nothing writes to disk). Development logs a
// colorized, human-readable line instead. Both go through the same
// redaction format, so a stray `logger.info('user', user)` never leaks a
// password or token into a log aggregator.

import winston from 'winston'

const { combine, timestamp, errors, json, colorize, printf } = winston.format

const SENSITIVE_FIELD_NAMES = new Set([
  'password',
  'token',
  'secret',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'sessiontoken',
])

const REDACTED = '[REDACTED]'
const MAX_REDACT_DEPTH = 6

// Mutates in place rather than rebuilding the object: winston's `info` carries
// internal Symbol-keyed properties (level, message) that later formats like
// `colorize()` depend on — reconstructing a plain object from `Object.entries`
// silently drops them and breaks colorized output.
function redactInPlace(obj: Record<string, unknown>, depth: number): void {
  if (depth >= MAX_REDACT_DEPTH) return
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_FIELD_NAMES.has(key.toLowerCase())) {
      obj[key] = REDACTED
      continue
    }
    const value = obj[key]
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object')
          redactInPlace(item as Record<string, unknown>, depth + 1)
      }
    } else if (value && typeof value === 'object') {
      redactInPlace(value as Record<string, unknown>, depth + 1)
    }
  }
}

const redact = winston.format((info) => {
  redactInPlace(info as unknown as Record<string, unknown>, 0)
  return info
})

const isProduction = process.env.NODE_ENV === 'production'

const devFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const { service: _service, ...rest } = meta
  const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : ''
  return `${ts} [${level}] ${stack ?? message}${extra}`
})

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  defaultMeta: { service: 'keystone-app' },
  format: combine(
    redact(),
    timestamp(),
    errors({ stack: true }),
    isProduction ? json() : combine(colorize(), devFormat),
  ),
  transports: [new winston.transports.Console()],
})

export default logger
