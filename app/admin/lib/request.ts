import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { message } from 'antd'

const instance: AxiosInstance = axios.create({
  baseURL: '',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

instance.interceptors.response.use(
  (response: AxiosResponse) => {
    return response
  },
  (error) => {
    if (error.response) {
      const status = error.response.status
      const errorMessage = error.response.data || '请求失败'

      if (status >= 400 && status < 500) {
        message.info(errorMessage)
      } else {
        message.error('操作失败')
      }
    } else if (error.request) {
      message.error('网络请求失败')
    } else {
      message.error('请求配置错误')
    }

    return Promise.reject(error)
  }
)

export async function request<T = any>(config: AxiosRequestConfig): Promise<T> {
  const response = await instance.request<any, AxiosResponse<T>>(config)
  return response.data
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

export default instance
