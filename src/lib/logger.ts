import winston from 'winston'
import { SeqTransport } from '@datalust/winston-seq'
import util from 'util'

const isDev = process.env.env === 'dev'
const seqUrl = process.env.SEQ_URL
const seqApiKey = process.env.SEQ_API_KEY

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const cleanMeta = Object.fromEntries(
          Object.entries(meta).filter(([k]) => typeof k !== 'symbol'),
        )
        const metaStr = Object.keys(cleanMeta).length ? `\n${util.inspect(cleanMeta, { colors: true, depth: isDev ? 6 : 4 })}` : ''
        return `${timestamp} [${level}]: ${message}${metaStr}`
      })
    ),
  }),
]

if (seqUrl) {
  transports.push(
    new SeqTransport({
      serverUrl: seqUrl,
      apiKey: seqApiKey,
      onError: (e: Error) => {
        console.error('SEQ记日志失败:', e)
      },
    })
  )
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { application: 'postmem', env: isDev ? 'dev' : 'production' },
  transports,
})
