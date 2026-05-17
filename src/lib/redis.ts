import Redis from 'ioredis'
import { logger } from '@/src/lib/logger'

export const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  db: Number(process.env.REDIS_DB) || 5,
  connectTimeout: 5000,
  retryStrategy(times: number) {
    return Math.min(times * 500, 5000)
  },
  enableReadyCheck: false,
  maxRetriesPerRequest: 3,
})

redis.on('connect', () => {
  logger.info('[Redis] connecting...')
})

redis.on('ready', () => {
  logger.info('[Redis] ready')
})

redis.on('error', (err) => {
  logger.error('[Redis] error', { errorMessage: err.message, stack: err.stack })
})