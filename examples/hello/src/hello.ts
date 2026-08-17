import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'
export const inject = []

export function apply(_ctx: Context) {
  console.log('[my-plugins/hello] loaded')
}
