import type { BellApi } from '@/preload/preload'

declare global {
  interface Window {
    bell: BellApi
  }
}

export {}
