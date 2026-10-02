import type { Episode } from '../sources/types'
import { Icon } from './Icon'

export function EpisodeCard({ ep, done, position, label }: { ep: Episode; done: boolean; position: number; label?: string }) {
  return (
    <>
      <div className="thumb">
        {ep.thumbnail ? <img src={ep.thumbnail} alt="" loading="lazy" /> : <div className="blank">{ep.number}</div>}
        {done && <div className="check"><Icon name="check" size={24} /></div>}
        {label ? <div className="tag now">{label}</div> : ep.filler && <div className="tag">{ep.filler === 'filler' ? 'Filler' : 'Part filler'}</div>}
        {!done && position > 0 && ep.duration ? <div className="progress"><div style={{ width: `${Math.min(100, (position / ep.duration) * 100)}%` }} /></div> : null}
      </div>
      <span>E{ep.number}{ep.title ? ` · ${ep.title}` : ''}</span>
      {ep.duration ? <span className="muted">{Math.round(ep.duration / 60)} min</span> : null}
    </>
  )
}
