import { useEffect, useState } from 'react'

export function Qr({ value, size = 360 }: { value: string; size?: number }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    import('qrcode').then((m) => m.default.toDataURL(value, { width: size, margin: 1 })).then(setSrc)
  }, [value, size])
  return src ? <img src={src} width={size} height={size} alt="" /> : null
}
