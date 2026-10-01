import { useEffect, useState } from 'react'
import { search } from '../anilist/api'
import { useActive } from '../nav/router'
import type { Card } from '../types'
import { Focusable } from '../ui/Focusable'
import { PosterRow } from '../ui/PosterRow'
import { applyKey, keyboardRows } from './keyboard'

const labels: Record<string, string> = { space: 'Space', del: 'Delete', clear: 'Clear' }

export function Search() {
  const [text, setText] = useState('')
  const [results, setResults] = useState<Card[]>([])
  const [status, setStatus] = useState('')
  const active = useActive()

  useEffect(() => {
    const query = text.trim()
    if (query.length < 2) {
      setResults([])
      setStatus('')
      return
    }
    let current = true
    const timer = setTimeout(() => {
      setStatus('Searching...')
      search(query)
        .then((cards) => {
          if (!current) return
          setResults(cards)
          setStatus(cards.length ? '' : 'No results')
        })
        .catch(() => current && setStatus('Search failed'))
    }, 400)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [text])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.keyCode < 48 || e.keyCode > 57) return
      e.preventDefault()
      setText((t) => applyKey(t, String(e.keyCode - 48)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  return (
    <div className="screen" style={{ display: 'flex', gap: 48 }}>
      <div style={{ flex: '0 0 620px' }}>
        <div className="btn" style={{ minHeight: 64, marginBottom: 24 }}>{text || <span className="muted">Type a title</span>}</div>
        {keyboardRows.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {row.map((key) => (
              <Focusable key={key} className="btn" autoFocus={key === 'a'} onEnter={() => setText((t) => applyKey(t, key))}>
                <span style={{ display: 'inline-block', minWidth: labels[key] ? 100 : 32, textAlign: 'center' }}>{labels[key] ?? key}</span>
              </Focusable>
            ))}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {status && <p className="muted">{status}</p>}
        <PosterRow title="Results" focusKey="row-results" cards={results.slice(0, 15)} />
        <PosterRow title="More" focusKey="row-results-2" cards={results.slice(15)} />
      </div>
    </div>
  )
}
