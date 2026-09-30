import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import type { ReactNode } from 'react'
import { useRouter } from '../nav/router'
import type { Card } from '../types'
import { Focusable } from './Focusable'

export function PosterRow({ title, cards, focusKey, badge, header }: { title: string; cards: Card[]; focusKey: string; badge?: (c: Card) => string | undefined; header?: ReactNode }) {
  const { ref, focusKey: key } = useFocusable<unknown, HTMLElement>({ focusKey, saveLastFocusedChild: true })
  const { push } = useRouter()
  if (!cards.length && !header) return null
  return (
    <FocusContext.Provider value={key}>
      <section ref={ref} className="row">
        <h2>{title}</h2>
        {header}
        <div className="row-track">
          {cards.map((card) => (
            <Focusable key={card.id} className="poster" onEnter={() => push({ name: 'details', id: card.id })}>
              <img src={card.cover} alt="" loading="lazy" />
              <span>{card.title}</span>
              {badge?.(card) && <span className="muted">{badge(card)}</span>}
            </Focusable>
          ))}
        </div>
      </section>
    </FocusContext.Provider>
  )
}
