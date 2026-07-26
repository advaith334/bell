import type { PilcrowApi } from '@/preload/preload'

declare global {
  interface Window {
    pilcrow: PilcrowApi
  }
}

export {}
