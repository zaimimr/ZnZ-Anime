import { useEffect, useState } from 'react'
import { viewer } from '../anilist/api'
import { clearToken, getToken } from '../auth/tokens'
import { useRouter } from '../nav/router'
import { getSettings, saveSettings } from '../settings'
import { orderedAdapters } from '../sources/registry'
import { applyMerge, isMerged, prepareMerge, readUnmatched } from '../sync/job'
import type { MergePlan } from '../sync/merge'
import { readQueue } from '../sync/queue'
import type { Provider } from '../types'
import { Focusable } from '../ui/Focusable'

type MergeState = { step: 'idle' } | { step: 'checking' } | { step: 'preview'; plan: MergePlan } | { step: 'running'; done: number; total: number } | { step: 'done' } | { step: 'error'; message: string }

export function SettingsScreen() {
  const { push } = useRouter()
  const [settings, setSettings] = useState(getSettings())
  const [anilistName, setAnilistName] = useState('')
  const [linked, setLinked] = useState({ anilist: Boolean(getToken('anilist')), mal: Boolean(getToken('mal')) })
  const [merge, setMerge] = useState<MergeState>(isMerged() ? { step: 'done' } : { step: 'idle' })

  useEffect(() => {
    if (linked.anilist) viewer().then((v) => setAnilistName(v.name)).catch(() => undefined)
  }, [linked.anilist])

  const update = (next: typeof settings) => {
    setSettings(next)
    saveSettings(next)
  }

  const unlink = (provider: Provider) => {
    clearToken(provider)
    setLinked((l) => ({ ...l, [provider]: false }))
  }

  const moveUp = (id: string) => {
    const order = orderedAdapters().map((a) => a.id)
    const i = order.indexOf(id)
    ;[order[i - 1], order[i]] = [order[i], order[i - 1]]
    update({ ...settings, sourceOrder: order })
  }

  const check = async () => {
    setMerge({ step: 'checking' })
    try {
      setMerge({ step: 'preview', plan: await prepareMerge() })
    } catch (e) {
      setMerge({ step: 'error', message: (e as Error).message })
    }
  }

  const run = async (plan: MergePlan) => {
    setMerge({ step: 'running', done: 0, total: plan.toAnilist.length + plan.toMal.length })
    try {
      await applyMerge(plan, (done, total) => setMerge({ step: 'running', done, total }))
      setMerge({ step: 'done' })
    } catch (e) {
      setMerge({ step: 'error', message: `${(e as Error).message}. Run the check again to continue.` })
    }
  }

  const account = (provider: Provider, label: string, detail: string) => (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 16 }}>
      <span style={{ width: 260 }}>{label}</span>
      <span className="muted" style={{ width: 400 }}>{detail}</span>
      {linked[provider]
        ? <Focusable className="btn" onEnter={() => unlink(provider)}>Unlink</Focusable>
        : <Focusable className="btn" onEnter={() => push({ name: 'pair', provider, next: 'settings' })}>Link</Focusable>}
    </div>
  )

  const unmatched = readUnmatched()
  const pending = readQueue().length

  return (
    <div className="screen" style={{ overflowY: 'auto' }}>
      <h1>Settings</h1>
      <h2>Accounts</h2>
      {account('anilist', 'AniList', linked.anilist ? anilistName || 'Linked' : 'Not linked')}
      {account('mal', 'MyAnimeList', linked.mal ? 'Linked' : 'Not linked')}
      {pending > 0 && <p className="muted">{pending} {pending === 1 ? 'update' : 'updates'} waiting to retry.</p>}

      <h2>Playback</h2>
      <Focusable className="btn" autoFocus onEnter={() => update({ ...settings, lang: settings.lang === 'sub' ? 'dub' : 'sub' })}>
        Default language: {settings.lang.toUpperCase()}
      </Focusable>

      <h2>Sources</h2>
      {orderedAdapters().map((adapter, i) => (
        <div key={adapter.id} style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 12 }}>
          <span style={{ width: 260 }}>{i + 1}. {adapter.id}</span>
          {i > 0 && <Focusable className="btn" onEnter={() => moveUp(adapter.id)}>Move up</Focusable>}
        </div>
      ))}

      {linked.anilist && linked.mal && (
        <>
          <h2>Merge AniList and MAL</h2>
          {merge.step === 'idle' && <p className="muted">Your lists have not been merged yet.</p>}
          {(merge.step === 'idle' || merge.step === 'done' || merge.step === 'error') && <Focusable className="btn" autoFocus={merge.step !== 'idle'} onEnter={check}>Check lists</Focusable>}
          {merge.step === 'checking' && <p>Reading both lists...</p>}
          {merge.step === 'preview' && (
            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
              <p>{merge.plan.toAnilist.length} changes on AniList, {merge.plan.toMal.length} on MAL, {merge.plan.unmatched.length} unmatched.</p>
              <Focusable className="btn active" autoFocus onEnter={() => run(merge.plan)}>Merge now</Focusable>
            </div>
          )}
          {merge.step === 'running' && <p>Merging {merge.done} / {merge.total}</p>}
          {merge.step === 'done' && <p className="muted">Merged. New changes go to both lists.</p>}
          {merge.step === 'error' && <p>{merge.message}</p>}
          {unmatched.length > 0 && (
            <>
              <h3>Unmatched ({unmatched.length})</h3>
              <ul className="muted">{unmatched.slice(0, 20).map((u) => <li key={`${u.anilistId}-${u.malId}`}>{u.title}</li>)}</ul>
            </>
          )}
        </>
      )}
    </div>
  )
}
