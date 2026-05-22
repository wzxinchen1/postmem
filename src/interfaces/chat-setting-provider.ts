import type { ChatSettingInfo } from '@/src/types'

export interface IChatSettingProvider {
  get(): Promise<ChatSettingInfo>
}
