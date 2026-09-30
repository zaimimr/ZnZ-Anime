import { useEffect, useState } from 'react'
import { search } from '../anilist/api'
import type { Card } from '../types'
import { Focusable } from '../ui/Focusable'
import { PosterRow } from '../ui/PosterRow'
import { applyKey, keyboardRows } from './keyboard'

const labels: Record<string, string> = { space: 'Space', del: 'Delete', clear: 'Clear' }

export function Search() {
  const [text, setText] = useState('')
  const [results, setResults] = useState<Card[]>([])
  const [status, setStatus] = useState('')

  useEffect(() => {
    const query = text.trim()
    if (query.length < 2) {
      setResults([])
      setStatus('')
      return
    }
    const timer = setTimeout(() => {
      setStatus('Searching...')
      search(query)
        .then((cards) => {
          setResults(cards)
          setStatus(cards.length ? '' : 'No results')
        })
        .catch(() => setStatus('Search failed'))
    }, 400)
    return () => clearTimeout(timer)
  }, [text])

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
