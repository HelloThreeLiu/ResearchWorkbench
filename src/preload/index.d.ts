import type { GezhiApi } from './index'

declare global {
  interface Window {
    api: GezhiApi
  }
}

export {}
