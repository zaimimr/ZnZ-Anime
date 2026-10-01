import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import type { ReactNode } from 'react'
import { useRouter } from '../nav/router'
import type { Card } from '../types'
import { Cover } from './Cover'
import { Focusable } from './Focusable'

export function PosterRow({ title, cards, focusKey, badge, header, autoFocus }: { title: string; cards: Card[]; focusKey: string; badge?: (c: Card) => string | undefined; header?: ReactNode; autoFocus?: boolean }) {
  const empty = !cards.length && !header
  const { ref, focusKey: key } = useFocusable<unknown, HTMLElement>({ focusKey, saveLastFocusedChild: true, focusable: !empty })
  const { push } = useRouter()
  if (empty) return <section ref={ref} />
  return (
    <FocusContext.Provider value={key}>
      <section ref={ref} className="row">
        <h2>{title}</h2>
        {header}
        <div className="row-track">
          {cards.map((card, i) => (
            <Focusable key={card.id} className="poster" autoFocus={autoFocus && i === 0} onEnter={() => push({ name: 'details', id: card.id })}>
              <Cover src={card.cover} />
              <span>{card.title}</span>
              {badge?.(card) && <span className="muted">{badge(card)}</span>}
            </Focusable>
          ))}
        </div>
      </section>
    </FocusContext.Provider>
  )
}
