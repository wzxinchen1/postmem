import { message } from 'antd'

export function useMessage() {
  const [msg, contextHolder] = message.useMessage()

  const showMessage = (type: 'success' | 'error', text: string) => {
    msg[type](text)
  }

  return { contextHolder, showMessage }
}
