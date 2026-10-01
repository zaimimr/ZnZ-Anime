export function Cover({ src }: { src: string }) {
  return <img className="cover" src={src} alt="" loading="lazy" onError={(e) => e.currentTarget.removeAttribute('src')} />
}
