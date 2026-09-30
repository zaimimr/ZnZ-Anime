import { FocusContext, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { type ReactNode, useEffect, useState } from 'react'
import { viewer } from '../anilist/api'
import { clearToken, getToken } from '../auth/tokens'
import { invalidateLibrary, linked, readLocal } from '../library'
import { malViewer } from '../mal/api'
import { useRouter } from '../nav/router'
import { getSettings, saveSettings, type Settings } from '../settings'
import { orderedAdapters } from '../sources/registry'
import { applyMerge, copyLocalList, isMerged, prepareMerge, readUnmatched } from '../sync/job'
import type { MergePlan } from '../sync/merge'
import { readQueue } from '../sync/queue'
import { flushQueue } from '../sync/writer'
import { checkServer, hosts, serverUrl } from '../hosts'
import { applyKey, keyboardRows } from './keyboard'
import type { Provider } from '../types'
import { Focusable } from '../ui/Focusable'
import { Icon, type IconName } from '../ui/Icon'
import { providerNames } from './Pair'

const REPO = 'github.com/zaimimr/znz-anime'

type Section = 'accounts' | 'server' | 'playback' | 'sync' | 'sources' | 'about'

const sections: { id: Section; icon: IconName; label: string; caption: string }[] = [
  { id: 'accounts', icon: 'user', label: 'Accounts', caption: 'AniList and MyAnimeList' },
  { id: 'server', icon: 'server', label: 'Server', caption: 'Needed for logins and video' },
  { id: 'playback', icon: 'sliders', label: 'Playback', caption: 'Audio, skipping, autoplay' },
  { id: 'sync', icon: 'sync', label: 'List sync', caption: 'Keep your lists matched' },
  { id: 'sources', icon: 'play', label: 'Sources', caption: 'Where episodes come from' },
  { id: 'about', icon: 'info', label: 'About', caption: 'Version and reset' },
]

const toggles = [
  ['autoSkipIntro', 'Skip intros', 'Jump past the opening song when its time is known for the video'],
  ['autoSkipOutro', 'Skip outros', 'Jump past the ending song, or count down to the next episode'],
  ['autoplayNext', 'Play next episode', 'Start the next episode after a short countdown'],
  ['skipFiller', 'Skip filler episodes', 'Leave out episodes that are not in the manga'],
] as const

type Job = { step: 'idle' } | { step: 'working'; label: string } | { step: 'preview'; plan: MergePlan } | { step: 'done'; message: string } | { step: 'error'; message: string }

function Row({ title, detail, children, onEnter, focusKey }: { title: string; detail?: ReactNode; children?: ReactNode; onEnter?: () => void; focusKey?: string }) {
  return (
    <Focusable className="setting" focusKey={focusKey} onEnter={onEnter}>
      <span className="setting-text">
        <span className="setting-title">{title}</span>
        {detail && <span className="setting-detail">{detail}</span>}
      </span>
      {children}
    </Focusable>
  )
}

const urlRows = keyboardRows.map((row) => row.map((key) => (key === ':' ? '.' : key)).filter((key) => key !== 'space'))
const keyLabels: Record<string, string> = { del: 'Delete', clear: 'Clear' }

function AddressEditor({ initial, check, failText, onDone }: { initial: string; check: (url: string) => Promise<boolean>; failText: string; onDone: (url: string | null) => void }) {
  const [text, setText] = useState(initial.replace(/^https:\/\//, ''))
  const [status, setStatus] = useState('')
  const save = async () => {
    const url = serverUrl(text)
    setStatus('Checking the address...')
    if (await check(url)) onDone(url)
    else setStatus(failText)
  }
  return (
    <div className="server-editor">
      <div className="server-input">https://<span>{text}</span><span className="caret" /></div>
      {urlRows.map((row, i) => (
        <div key={i} className="key-row">
          {row.map((key) => (
            <Focusable key={key} className="key" autoFocus={i === 0 && key === 'a'} onEnter={() => setText((t) => applyKey(t, key))}>{keyLabels[key] ?? key}</Focusable>
          ))}
        </div>
      ))}
      <div className="key-row actions">
        <Focusable className="btn active" onEnter={save}>Save</Focusable>
        <Focusable className="btn" onEnter={() => onDone(null)}>Cancel</Focusable>
      </div>
      {status && <p className="pane-note">{status}</p>}
    </div>
  )
}

function Switch({ on }: { on: boolean }) {
  return <span className={`switch ${on ? 'on' : ''}`}><span /></span>
}

function Pane({ children }: { children: ReactNode }) {
  const { ref, focusKey } = useFocusable<unknown, HTMLDivElement>({ focusKey: 'settings-pane', saveLastFocusedChild: false })
  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="settings-pane">{children}</div>
    </FocusContext.Provider>
  )
}

function Rail({ current, onPick }: { current: Section; onPick: (s: Section) => void }) {
  const { ref, focusKey } = useFocusable<unknown, HTMLDivElement>({ focusKey: 'settings-rail', saveLastFocusedChild: true, preferredChildFocusKey: `rail-${current}` })
  return (
    <FocusContext.Provider value={focusKey}>
      <nav ref={ref} className="settings-rail">
        <img className="rail-art" src={`${import.meta.env.BASE_URL}logo.svg`} alt="" />
        <h1>Settings</h1>
        {sections.map((s) => (
          <Focusable key={s.id} focusKey={`rail-${s.id}`} className={`rail-item ${s.id === current ? 'current' : ''}`} autoFocus={s.id === 'accounts'} onFocus={() => onPick(s.id)} onEnter={() => setFocus('settings-pane')}>
            <Icon name={s.icon} size={34} />
            <span>
              <span className="rail-label">{s.label}</span>
              <span className="rail-caption">{s.caption}</span>
            </span>
          </Focusable>
        ))}
      </nav>
    </FocusContext.Provider>
  )
}

export function SettingsScreen() {
  const { push, reset, setBackHandler } = useRouter()
  const [section, setSection] = useState<Section>('accounts')
  const [settings, setSettings] = useState(getSettings())
  const [names, setNames] = useState<Record<Provider, string>>({ anilist: '', mal: '' })
  const [accounts, setAccounts] = useState({ anilist: Boolean(getToken('anilist')), mal: Boolean(getToken('mal')) })
  const [job, setJob] = useState<Job>({ step: 'idle' })
  const [pending, setPending] = useState(readQueue().length)
  const [local, setLocal] = useState(readLocal().length)
  const [confirmReset, setConfirmReset] = useState(false)
  const [editingServer, setEditingServer] = useState(false)
  const [sourceView, setSourceView] = useState<string | null>(null)
  const [editingSource, setEditingSource] = useState(false)
  const [server, setServer] = useState(hosts.auth)
  const [confirmUnlink, setConfirmUnlink] = useState<Provider | null>(null)

  useEffect(() => {
    if (accounts.anilist) viewer().then((v) => setNames((n) => ({ ...n, anilist: v.name }))).catch(() => undefined)
    if (accounts.mal) malViewer().then((v) => setNames((n) => ({ ...n, mal: v.name }))).catch(() => undefined)
  }, [accounts])

  useEffect(() => {
    setConfirmReset(false)
    setConfirmUnlink(null)
    setEditingServer(false)
    setSourceView(null)
    setEditingSource(false)
  }, [section])

  useEffect(() => {
    if (!editingServer && !sourceView) return
    setBackHandler(() => {
      if (editingSource) setEditingSource(false)
      else if (sourceView) setSourceView(null)
      else setEditingServer(false)
      return true
    })
    return () => setBackHandler(null)
  }, [editingServer, sourceView, editingSource, setBackHandler])

  const update = (change: Partial<Settings>) => {
    const next = { ...settings, ...change }
    setSettings(next)
    saveSettings(next)
    invalidateLibrary()
  }

  const toggleAccount = (provider: Provider) => {
    if (!accounts[provider]) return push({ name: 'pair', provider, next: 'settings' })
    if (confirmUnlink !== provider) return setConfirmUnlink(provider)
    clearToken(provider)
    invalidateLibrary()
    setConfirmUnlink(null)
    setAccounts((a) => ({ ...a, [provider]: false }))
    setNames((n) => ({ ...n, [provider]: '' }))
  }

  const moveUp = (id: string) => {
    const order = orderedAdapters().map((a) => a.id)
    const i = order.indexOf(id)
    ;[order[i - 1], order[i]] = [order[i], order[i - 1]]
    update({ sourceOrder: order })
  }

  const checkLists = async () => {
    setJob({ step: 'working', label: 'Reading both lists...' })
    try {
      setJob({ step: 'preview', plan: await prepareMerge() })
    } catch (e) {
      setJob({ step: 'error', message: (e as Error).message })
    }
  }

  const merge = async (plan: MergePlan) => {
    setJob({ step: 'working', label: 'Merging...' })
    try {
      await applyMerge(plan, (done, total) => setJob({ step: 'working', label: `Merging ${done} of ${total}` }))
      setJob({ step: 'done', message: 'Merged. New changes go to both lists.' })
    } catch (e) {
      setJob({ step: 'error', message: `${(e as Error).message}. Check again to continue.` })
    }
    invalidateLibrary()
  }

  const copyLocal = async () => {
    setJob({ step: 'working', label: 'Reading your account list...' })
    try {
      const skipped = await copyLocalList((done, total) => setJob({ step: 'working', label: `Copying ${done} of ${total}` }))
      setJob({ step: 'done', message: skipped ? `Copied. ${skipped} ${skipped === 1 ? 'show is' : 'shows are'} not on MyAnimeList and stayed on this TV.` : 'Your list from this TV is now on your account.' })
    } catch (e) {
      setJob({ step: 'error', message: `${(e as Error).message}. Try again to continue.` })
    }
    setLocal(readLocal().length)
  }

  const retryQueue = async () => {
    setJob({ step: 'working', label: 'Sending waiting updates...' })
    await flushQueue()
    const left = readQueue().length
    setPending(left)
    setJob(left ? { step: 'error', message: `${left} still waiting. They will be tried again when the app starts.` } : { step: 'done', message: 'All updates sent.' })
  }

  const resetApp = () => {
    if (!confirmReset) return setConfirmReset(true)
    localStorage.clear()
    invalidateLibrary()
    reset({ name: 'welcome' })
  }

  useEffect(() => {
    if (job.step === 'preview') setFocus('merge-now')
  }, [job.step])

  const both = accounts.anilist && accounts.mal
  const main = linked()[0]
  const busy = job.step === 'working'
  const unmatched = readUnmatched()

  const content: Record<Section, ReactNode> = {
    accounts: (
      <>
        <p className="pane-lead">Both are optional. Link one, both or none.</p>
        {(['anilist', 'mal'] as Provider[]).map((p) => (
          <Row
            key={p}
            title={providerNames[p]}
            onEnter={() => toggleAccount(p)}
            detail={accounts[p] ? (names[p] ? `Signed in as ${names[p]}` : 'Linked') : 'Not linked'}
          >
            <span className={`pill ${accounts[p] ? (confirmUnlink === p ? 'danger' : '') : 'accent'}`}>
              {accounts[p] ? (confirmUnlink === p ? 'Press OK to unlink' : 'Unlink') : 'Link'}
            </span>
          </Row>
        ))}
        <div className="pane-note">
          {main
            ? `${providerNames[main]} is your main list. Home, My list and the schedule read from it.`
            : 'No account linked. Your list is saved on this TV only.'}
        </div>
      </>
    ),
    server: editingServer ? (
      <AddressEditor
        initial={server}
        check={checkServer}
        failText="That address did not answer like a ZnZ Anime server. Check it and try again"
        onDone={(url) => {
          setEditingServer(false)
          if (url === null) return setFocus('server-row')
          update({ server: url })
          setServer(url)
          setJob({ step: 'done', message: 'Server saved.' })
          setFocus('server-row')
        }}
      />
    ) : (
      <>
        <p className="pane-lead">A small free Cloudflare Worker that you run yourself. It logs you in and plays streams that the TV cannot open on its own.</p>
        <Row title="Server address" focusKey="server-row" detail={server ? server.replace(/^https:\/\//, '') : 'Not set. Most videos will not play.'} onEnter={() => setEditingServer(true)}>
          <span className={`pill ${server ? '' : 'accent'}`}>{server ? 'Change' : 'Add'}</span>
        </Row>
        {settings.server && (
          <Row title="Forget this address" detail="Go back to the server this build came with, if any" onEnter={() => { update({ server: '' }); setServer(hosts.auth) }}>
            <span className="pill">Forget</span>
          </Row>
        )}
        {job.step === 'done' && <div className="pane-note">{job.message}</div>}
        <div className="pane-note">How to set one up: see the README at {REPO}</div>
      </>
    ),
    playback: (
      <>
        <Row title="Audio" detail={settings.lang === 'sub' ? 'Japanese with English subtitles' : 'English dub when there is one'} onEnter={() => update({ lang: settings.lang === 'sub' ? 'dub' : 'sub' })}>
          <span className="segmented">
            <span className={settings.lang === 'sub' ? 'on' : ''}>Japanese</span>
            <span className={settings.lang === 'dub' ? 'on' : ''}>English</span>
          </span>
        </Row>
        {toggles.map(([key, title, detail]) => (
          <Row key={key} title={title} detail={detail} onEnter={() => update({ [key]: !settings[key] })}>
            <Switch on={settings[key]} />
          </Row>
        ))}
      </>
    ),
    sync: (
      <>
        {both && (
          <>
            <Row title="Keep AniList and MAL in sync" detail="Every change you make goes to both lists" onEnter={() => update({ syncBoth: !settings.syncBoth })}>
              <Switch on={settings.syncBoth} />
            </Row>
            <Row
              title="Merge both lists now"
              focusKey="merge-check"
              detail={isMerged() ? 'Done before. Run it again to catch changes made elsewhere.' : 'Matches shows on both sites, keeping the most progress'}
              onEnter={() => !busy && checkLists()}
            >
              <span className="pill">Check</span>
            </Row>
            {job.step === 'preview' && (
              <Row
                title={`${job.plan.toAnilist.length} changes on AniList, ${job.plan.toMal.length} on MAL`}
                focusKey="merge-now"
                detail={job.plan.unmatched.length ? `${job.plan.unmatched.length} shows only exist on one site and are left alone` : undefined}
                onEnter={() => !busy && merge(job.plan)}
              >
                <span className="pill accent">Merge now</span>
              </Row>
            )}
          </>
        )}
        {main && local > 0 && (
          <Row title={`Copy ${local} ${local === 1 ? 'show' : 'shows'} from this TV`} detail={`Adds the list you kept without an account to ${providerNames[main]}`} onEnter={() => !busy && copyLocal()}>
            <span className="pill accent">Copy</span>
          </Row>
        )}
        {pending > 0 && (
          <Row title={`${pending} ${pending === 1 ? 'update' : 'updates'} waiting`} detail="These could not be sent, often because the TV was offline" onEnter={() => !busy && retryQueue()}>
            <span className="pill">Send now</span>
          </Row>
        )}
        {job.step === 'working' && <div className="pane-note">{job.label}</div>}
        {(job.step === 'done' || job.step === 'error') && <div className={`pane-note ${job.step === 'error' ? 'bad' : ''}`}>{job.message}</div>}
        {!both && !(main && local) && pending === 0 && (
          <div className="pane-empty">
            <Icon name="sync" size={56} />
            <p>{main ? `Link ${providerNames[main === 'anilist' ? 'mal' : 'anilist']} too if you want both lists kept in sync.` : 'Link an account in Accounts to keep your list online and in sync.'}</p>
            <Focusable className="btn" onEnter={() => setFocus('rail-accounts')}>Go to Accounts</Focusable>
          </div>
        )}
        {both && unmatched.length > 0 && (
          <div className="pane-note">
            Only on one site: {unmatched.slice(0, 6).map((u) => u.title).join(', ')}{unmatched.length > 6 ? ` and ${unmatched.length - 6} more` : ''}
          </div>
        )}
      </>
    ),
    sources: sourceView ? (() => {
      const adapters = orderedAdapters()
      const index = adapters.findIndex((a) => a.id === sourceView)
      const adapter = adapters[index]
      const custom = settings.sourceHosts[adapter.id]
      const address = (custom || adapter.defaultHost).replace(/^https:\/\//, '')
      const setHost = (url: string) => update({ sourceHosts: { ...settings.sourceHosts, [adapter.id]: url } })
      if (editingSource) {
        return (
          <AddressEditor
            initial={custom || adapter.defaultHost}
            check={adapter.check}
            failText={`That address did not answer like ${adapter.name}. Check it and try again.`}
            onDone={(url) => {
              setEditingSource(false)
              if (url) setHost(url === adapter.defaultHost ? '' : url)
            }}
          />
        )
      }
      return (
        <>
          <p className="pane-lead">{adapter.name}{custom ? ' is using your own address.' : ' is using its default address.'}</p>
          <Row title="Address" detail={address} onEnter={() => setEditingSource(true)}>
            <span className="pill">Change</span>
          </Row>
          {custom && (
            <Row title="Use the default address" detail={adapter.defaultHost.replace(/^https:\/\//, '')} onEnter={() => setHost('')}>
              <span className="pill">Reset</span>
            </Row>
          )}
          {index > 0 && (
            <Row title="Try this source earlier" detail={`Now number ${index + 1} of ${adapters.length}`} onEnter={() => moveUp(adapter.id)}>
              <span className="pill with-icon"><Icon name="up" size={22} /> Move up</span>
            </Row>
          )}
          <Row title="Back to sources" onEnter={() => setSourceView(null)}>
            <Icon name="back" size={28} />
          </Row>
        </>
      )
    })() : (
      <>
        <p className="pane-lead">Where episodes come from. The app tries these in order until one has the episode. Choose one to change its address, for example to a mirror site.</p>
        {orderedAdapters().map((adapter, i) => (
          <Row key={adapter.id} title={`${i + 1}. ${adapter.name}`} detail={(settings.sourceHosts[adapter.id] || adapter.defaultHost).replace(/^https:\/\//, '')} onEnter={() => setSourceView(adapter.id)}>
            <Icon name="right" size={28} />
          </Row>
        ))}
      </>
    ),
    about: (
      <>
        <div className="about-card">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" />
          <div>
            <div className="brand">ZnZ<span>Anime</span></div>
            <div className="muted">Version {import.meta.env.VITE_APP_VERSION as string}</div>
            <div className="muted">{REPO}</div>
          </div>
        </div>
        <Row title="Reset the app" detail="Logs out, forgets settings, progress and the list on this TV" onEnter={resetApp}>
          <span className={`pill ${confirmReset ? 'danger' : ''}`}>{confirmReset ? 'Press OK to erase' : 'Reset'}</span>
        </Row>
      </>
    ),
  }

  const current = sections.find((s) => s.id === section)!

  return (
    <div className="screen settings">
      <Rail current={section} onPick={setSection} />
      <Pane key={section}>
        <h2>{current.label}</h2>
        {content[section]}
      </Pane>
    </div>
  )
}
