import { useRouter } from '../nav/router'
import { finishOnboarding } from '../onboarding'
import { Focusable } from '../ui/Focusable'
import { Icon } from '../ui/Icon'

const choices = [
  { id: 'anilist', mark: 'AL', title: 'AniList', detail: 'Use your AniList list and keep it updated as you watch' },
  { id: 'mal', mark: 'MAL', title: 'MyAnimeList', detail: 'Use your MyAnimeList list and keep it updated as you watch' },
  { id: 'guest', mark: '', title: 'No account', detail: 'Keep your list on this TV. You can link an account later' },
] as const

export function Welcome() {
  const { push, reset } = useRouter()
  const pick = (id: (typeof choices)[number]['id']) => {
    if (id === 'guest') {
      finishOnboarding()
      reset({ name: 'home' })
    } else push({ name: 'pair', provider: id, next: 'home' })
  }
  return (
    <div className="screen welcome">
      <div className="welcome-hero">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" />
        <div>
          <div className="brand">ZnZ<span>Anime</span></div>
          <h1>Anime on the big screen</h1>
          <p className="muted">Pick how you want to keep track of what you watch. You can change this later in Settings.</p>
        </div>
      </div>
      <div className="choices">
        {choices.map((c, i) => (
          <Focusable key={c.id} className={`choice ${c.id}`} autoFocus={i === 0} onEnter={() => pick(c.id)}>
            <span className="choice-mark">{c.mark || <Icon name="tv" size={44} />}</span>
            <span className="choice-title">{c.title}</span>
            <span className="choice-detail">{c.detail}</span>
          </Focusable>
        ))}
      </div>
    </div>
  )
}

