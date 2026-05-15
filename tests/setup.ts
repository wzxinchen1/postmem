import dotenv from 'dotenv'
import path from 'path'

// 加载项目根目录的 .env 文件到 process.env
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })
