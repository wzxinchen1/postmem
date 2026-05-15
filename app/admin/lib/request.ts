import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'

const instance: AxiosInstance = axios.create({
  baseURL: '',
  timeout: 0,
  headers: {
    'Content-Type': 'application/json',
  },
})

export interface ApiError {
  success: false
  error: {
    code: string
    message: string
  }
}

export class RequestError extends Error {
  public code: string
  
  constructor(message: string, code: string) {
    super(message)
    this.code = code
    this.name = 'RequestError'
  }
}

export async function request<T = any>(config: AxiosRequestConfig): Promise<T> {
  try {
    const response = await instance.request<any, AxiosResponse<T>>(config)
    return response.data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status
      const data = error.response.data
      
      // 提取错误消息
      let message: string
      if (data?.error?.message) {
        message = data.error.message
      } else if (typeof data?.message === 'string') {
        message = data.message
      } else if (typeof data === 'string') {
        message = data
      } else {
        message = error.message
      }
      
      if (status >= 400 && status < 500) {
        // 4xx 错误：显示服务器原始报错
        throw new RequestError(message, data?.error?.code || String(status))
      } else if (status >= 500) {
        // 5xx 错误：显示通用提示
        throw new RequestError('服务器异常', String(status))
      }
    }
    // 其他错误（网络错误等）
    throw new RequestError('网络请求失败', 'NETWORK_ERROR')
  }
}

export async function post<T = any>(url: string, data?: any): Promise<T> {
  return request<T>({ method: 'POST', url, data })
}

export async function get<T = any>(url: string, params?: any): Promise<T> {
  return request<T>({ method: 'GET', url, params })
}

export async function del<T = any>(url: string, params?: any): Promise<T> {
  return request<T>({ method: 'DELETE', url, params })
}

export async function streamPost(
  url: string,
  data: any,
  onEvent: (event: any) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  })

  if (!response.ok || !response.body) {
    throw new RequestError('请求失败', String(response.status))
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6))
          onEvent(event)
        } catch {
          // ignore parse errors
        }
      }
    }
  }
}

export default instance
