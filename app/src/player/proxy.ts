import { b64urlEncode } from '../b64'
import { hosts } from '../hosts'

export function playableUrl(url: string, headers?: Record<string, string>): string {
  const referer = headers?.Referer ?? headers?.referer
  if (!referer) return url
  return `${hosts.auth}/proxy?u=${b64urlEncode(url)}&r=${b64urlEncode(referer)}`
}
