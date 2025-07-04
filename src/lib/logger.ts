import winston from 'winston'

// Create logger configuration
const logLevel = process.env.LOG_LEVEL || 'info'
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
)

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}] ${message}`
    
    // Add metadata if present
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
    return log + metaStr
  })
)

// Create logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  defaultMeta: { service: 'helios9-mcp-server' },
  transports: [
    // Console transport - MUST use stderr for MCP compatibility
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat,
      stderrLevels: ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']
    })
  ]
})

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: logFormat
  }))
  
  logger.add(new winston.transports.File({
    filename: 'logs/combined.log',
    format: logFormat
  }))
}

// Log unhandled exceptions and rejections (to stderr)
logger.exceptions.handle(
  new winston.transports.Console({ 
    format: consoleFormat,
    stderrLevels: ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']
  })
)

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

export default logger