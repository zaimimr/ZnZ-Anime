const KEY = new TextEncoder().encode('miruro/catalog')

export async function decodeCatalog(res: Response): Promise<unknown> {
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('octet-stream')) return res.json()
  const bytes = new Uint8Array(await res.arrayBuffer())
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= KEY[i % KEY.length]
  const text = await new Response(new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip'))).text()
  return JSON.parse(text)
}
