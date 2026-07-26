import type { BellApi } from '@/preload'

declare global {
  interface Window {
    bell: BellApi
  }
}

export {}
