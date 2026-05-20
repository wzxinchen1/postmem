import { openai } from './openai'
import { anthropic } from './anthropic'
import { googleGemini } from './google-gemini'
import { metaLlama } from './meta-llama'
import { mistral } from './mistral'
import { deepseek } from './deepseek'
import { kimi } from './kimi'
import { zhipu } from './zhipu'
import { tongyi } from './tongyi'
import { doubao } from './doubao'
import { baiduWenxin } from './baidu-wenxin'
import { hunyuan } from './hunyuan'
import { xunfei } from './xunfei'
import { azureOpenai } from './azure-openai'
import { alibailian } from './alibailian'
import { tokenhub } from './tokenhub'
import { openrouter } from './openrouter'
import { n1n } from './n1n'
import { siliconflow } from './siliconflow'
import { ollama } from './ollama'

export const vendors = [
  openai,
  anthropic,
  googleGemini,
  metaLlama,
  mistral,

  deepseek,
  kimi,
  zhipu,
  tongyi,
  doubao,
  baiduWenxin,
  hunyuan,
  xunfei,

  azureOpenai,
  alibailian,
  tokenhub,

  openrouter,
  n1n,
  siliconflow,

  ollama,
]
