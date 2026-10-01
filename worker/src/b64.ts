export function bytesToB64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
}

export function b64urlEncode(text: string): string {
  return bytesToB64url(new TextEncoder().encode(text))
}

export function b64urlDecode(value: string): string {
  return new TextDecoder().decode(b64urlToBytes(value))
}
