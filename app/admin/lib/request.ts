import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'

const instance: AxiosInstance = axios.create({
  baseURL: '',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

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
