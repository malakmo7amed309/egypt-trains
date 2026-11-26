import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import { STATION_ORDER, TRAINS, TYPES } from './data'

const FLAP_CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-.'

// Cairo wall clock, regardless of the viewer's timezone
function cairoNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short', hour12: false,
  }).formatToParts(new Date())
  const get = (t) => parts.find((p) => p.type === t)?.value
  const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const h = get('hour') === '24' ? 0 : parseInt(get('hour'), 10)
  return {
    mins: h * 60 + parseInt(get('minute'), 10),
    secs: parseInt(get('second'), 10),
    dow: days[get('weekday')],
    label: `${get('hour')}:${get('minute')}:${get('second')}`,
    dayLabel: get('weekday'),
  }
}

const toMins = (t) => parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3), 10)

function runsToday(train, dow) {
  return !train.days || train.days.includes(dow)
}

function stationTime(train, stationIdx) {
  const s = train.stops.find((st) => st[0] === stationIdx)
  return s ? { time: s[1], offset: s[2] || 0 } : null
}

function terminus(train) {
  if (train.dir === 0) return train.dest || 'Alexandria'
  return train.dest || 'Cairo'
}

function origin(train) {
  if (train.dir === 0) return train.from || 'Cairo'
  return train.from || 'Alexandria'
}

function statusFor(depMins, nowMins, isArrival) {
  const diff = depMins - nowMins
  if (diff < 0) return { key: 'departed', label: isArrival ? 'ARRIVED' : 'DEPARTED' }
  if (diff <= 15) return { key: 'boarding', label: isArrival ? 'ARRIVING' : 'BOARDING' }
  return { key: 'scheduled', label: 'ON TIME' }
}

function countdown(depMins, nowMins, secs) {
  let diff = depMins * 60 - (nowMins * 60 + secs)
  if (diff < 0) diff += 24 * 3600
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// One split-flap character. Cycles through the flap alphabet when it changes.
function FlapChar({ ch }) {
  const [shown, setShown] = useState(ch)
  const target = useRef(ch)
  useEffect(() => {
    target.current = ch
    if (shown === ch) return
    const timer = setInterval(() => {
      setShown((cur) => {
        if (cur === target.current) {
          clearInterval(timer)
          return cur
        }
        const ci = FLAP_CHARS.indexOf(cur === '' ? ' ' : cur)
        const ti = FLAP_CHARS.indexOf(target.current === '' ? ' ' : target.current)
        const from = ci === -1 ? 0 : ci
        const to = ti === -1 ? 0 : ti
        const next = from <= to ? from + 1 : from + 1
        return FLAP_CHARS[next % FLAP_CHARS.length]
      })
    }, 45)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch])
  const final = shown === ch
  return (
    <span className={`flap-char ${final ? '' : 'flap-spin'}`}>
      <span className="flap-glyph">{shown === ' ' ? ' ' : shown}</span>
      <span className="flap-split" />
    </span>
  )
}

function FlapText({ text, className = '' }) {
  return (
    <span className={`flap ${className}`} aria-label={text}>
      {text.split('').map((c, i) => (
        <FlapChar key={i} ch={c.toUpperCase()} />
      ))}
    </span>
  )
}

function AuthModal({ mode, setMode, onClose, onDone }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (data.session) {
          onDone()
        } else {
          setMsg({ ok: true, text: 'Account created. Now sign in with your email and password.' })
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onDone()
      }
    } catch (err) {
      setMsg({ ok: false, text: err.message || 'Something went wrong.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-panel p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={mode === 'up' ? 'Create account' : 'Sign in'}
      >
        <h2 className="font-board text-lg tracking-widest">
          {mode === 'up' ? 'CREATE ACCOUNT' : 'SIGN IN'}
        </h2>
        <p className="mt-1 text-xs text-dim">
          {mode === 'up' ? 'Save your planned trips to your account.' : 'Welcome back aboard.'}
        </p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-cream placeholder-dim focus:border-signal focus:outline-none"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (6+ characters)"
            className="w-full rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-cream placeholder-dim focus:border-signal focus:outline-none"
          />
          {msg && (
            <p className={`text-xs ${msg.ok ? 'text-ok' : 'text-signal'}`}>{msg.text}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-signal px-3 py-2 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? 'One moment...' : mode === 'up' ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <div className="mt-4 flex items-center justify-between text-xs">
          <button
            onClick={() => { setMode(mode === 'up' ? 'in' : 'up'); setMsg(null) }}
            className="text-dim hover:text-signal"
          >
            {mode === 'up' ? 'Have an account? Sign in' : 'New here? Create an account'}
          </button>
          <button onClick={onClose} className="text-dim hover:text-cream">Close</button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [stationIdx, setStationIdx] = useState(0)
  const [dirFilter, setDirFilter] = useState('all') // all | 0 | 1
  const [now, setNow] = useState(cairoNow)
  const [fromIdx, setFromIdx] = useState(0)
  const [toIdx, setToIdx] = useState(16)
  const boardRef = useRef(null)

  const [session, setSession] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState('in')
  const [saveMsg, setSaveMsg] = useState('')

  const trips = session?.user?.user_metadata?.trips || []

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(cairoNow()), 1000)
    return () => clearInterval(t)
  }, [])

  const rows = useMemo(() => {
    const out = []
    for (const tr of TRAINS) {
      if (!runsToday(tr, now.dow)) continue
      if (dirFilter !== 'all' && tr.dir !== Number(dirFilter)) continue
      const st = stationTime(tr, stationIdx)
      if (!st) continue
      const depMins = st.offset ? st.offset * 1440 + toMins(st.time) : toMins(st.time)
      const isArrival = tr.stops[tr.stops.length - 1][0] === stationIdx && tr.stops[0][0] !== stationIdx
      out.push({ train: tr, time: st.time, depMins, isArrival })
    }
    // upcoming first, then departed (most recent last)
    const upcoming = out.filter((r) => r.depMins >= now.mins).sort((a, b) => a.depMins - b.depMins)
    const gone = out.filter((r) => r.depMins < now.mins).sort((a, b) => a.depMins - b.depMins)
    return [...upcoming, ...gone]
  }, [stationIdx, dirFilter, now])

  const nextDep = rows.find((r) => r.depMins >= now.mins)

  const plan = useMemo(() => {
    if (fromIdx === toIdx) return []
    const dir = fromIdx < toIdx ? 0 : 1
    const out = []
    for (const tr of TRAINS) {
      if (tr.dir !== dir || !runsToday(tr, now.dow)) continue
      const a = stationTime(tr, fromIdx)
      const b = stationTime(tr, toIdx)
      if (!a || !b) continue
      const dep = toMins(a.time) + (a.offset || 0) * 1440
      let arr = toMins(b.time) + (b.offset || 0) * 1440
      if (arr < dep) arr += 1440
      out.push({ train: tr, dep, arr, depTime: a.time, arrTime: b.time, dur: arr - dep })
    }
    return out
      .filter((p) => p.dep >= now.mins)
      .sort((a, b) => a.dep - b.dep)
      .slice(0, 3)
  }, [fromIdx, toIdx, now])

  const scrollBoard = () => boardRef.current && boardRef.current.scrollIntoView({ behavior: 'smooth' })

  const saveTrips = async (next) => {
    const { data, error } = await supabase.auth.updateUser({ data: { trips: next } })
    if (!error && data.user) setSession((s) => ({ ...s, user: data.user }))
    return !error
  }

  const saveTrip = async (p) => {
    const entry = {
      from: fromIdx,
      to: toIdx,
      no: p.train.no,
      depTime: p.depTime,
      arrTime: p.arrTime,
      type: p.train.type,
    }
    const exists = trips.some((t) => t.from === entry.from && t.to === entry.to && t.no === entry.no)
    if (exists) {
      setSaveMsg('That trip is already in your list.')
      setTimeout(() => setSaveMsg(''), 3000)
      return
    }
    const ok = await saveTrips([...trips, entry])
    setSaveMsg(ok ? `Saved: ${STATION_ORDER[entry.from]} to ${STATION_ORDER[entry.to]}, train ${entry.no}.` : 'Could not save - try again.')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const removeTrip = async (idx) => {
    await saveTrips(trips.filter((_, i) => i !== idx))
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const userLabel = session?.user?.email || ''

  return (
    <div className="min-h-screen bg-ink text-cream">
      <header className="border-b-4 border-signal bg-panel">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <div>
            <h1 className="font-board text-2xl font-bold tracking-widest sm:text-3xl">
              EGYPT TRAINS <span className="text-signal">LIVE</span>
            </h1>
            <p className="mt-1 text-xs uppercase tracking-widest text-dim">Cairo - Alexandria line - departures board</p>
          </div>
          <div className="flex items-center gap-4">
            {session ? (
              <div className="flex items-center gap-2">
                <span className="hidden max-w-[10rem] truncate text-xs text-dim sm:inline" title={userLabel}>{userLabel}</span>
                <button
                  onClick={signOut}
                  className="rounded-lg border border-line bg-panel2 px-3 py-2 text-[11px] uppercase tracking-widest text-dim transition hover:border-signal hover:text-signal"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setAuthMode('in'); setAuthOpen(true) }}
                className="rounded-lg bg-signal px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-ink transition hover:brightness-110"
              >
                Sign in
              </button>
            )}
            <div className="text-right">
              <FlapText text={now.label} className="text-xl" />
              <p className="mt-1 text-[11px] uppercase tracking-widest text-dim">{now.dayLabel} - Cairo time</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {/* controls */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-[11px] uppercase tracking-widest text-dim">Station</label>
          <select
            value={stationIdx}
            onChange={(e) => setStationIdx(Number(e.target.value))}
            className="rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-cream focus:border-signal focus:outline-none"
          >
            {STATION_ORDER.map((s, i) => (
              <option key={s} value={i}>{s}</option>
            ))}
          </select>
          <div className="flex overflow-hidden rounded-lg border border-line text-sm">
            {[['all', 'Both ways'], ['0', 'To Alexandria'], ['1', 'To Cairo']].map(([v, l]) => (
              <button
                key={v}
                onClick={() => setDirFilter(v)}
                className={`px-3 py-2 transition ${String(dirFilter) === v ? 'bg-signal text-ink font-semibold' : 'bg-panel2 text-dim hover:text-cream'}`}
              >
                {l}
              </button>
            ))}
          </div>
          <button onClick={scrollBoard} className="ml-auto hidden text-[11px] uppercase tracking-widest text-dim hover:text-signal sm:block">
            Board below
          </button>
        </div>

        {/* next train hero */}
        {nextDep ? (
          <section className="mt-5 rounded-2xl border border-line bg-panel p-5 sm:p-6">
            <p className="text-[11px] uppercase tracking-widest text-dim">
              {nextDep.isArrival ? `Next arrival at ${STATION_ORDER[stationIdx]}` : `Next from ${STATION_ORDER[stationIdx]}`}
            </p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <div>
                <FlapText text={terminus(nextDep.train)} className="text-2xl sm:text-4xl" />
                <p className="mt-2 text-sm text-dim">
                  Train {nextDep.train.no} - {TYPES[nextDep.train.type]}
                  {nextDep.train.from ? ` - through from ${nextDep.train.from}` : ''}
                </p>
              </div>
              <div className="text-right">
                <FlapText text={nextDep.time} className="text-2xl sm:text-4xl" />
                <p className="mt-2 font-board text-sm tracking-widest text-signal">
                  {nextDep.isArrival ? 'arrives in' : 'leaves in'} {countdown(nextDep.depMins, now.mins, now.secs)}
                </p>
              </div>
            </div>
          </section>
        ) : (
          <section className="mt-5 rounded-2xl border border-line bg-panel p-6 text-center text-dim">
            No more trains from {STATION_ORDER[stationIdx]} today. The board rolls over at midnight.
          </section>
        )}

        {/* board */}
        <section ref={boardRef} className="mt-6 overflow-hidden rounded-2xl border border-line bg-panel">
          <div className="grid grid-cols-[3.2rem_1fr_4.6rem_6.2rem_5.4rem] items-center gap-2 border-b border-line bg-panel2 px-3 py-2 text-[10px] uppercase tracking-widest text-dim sm:grid-cols-[4rem_1fr_6rem_8rem_7rem] sm:px-4">
            <span>Train</span><span>Destination</span><span className="text-right">Time</span><span className="text-right">Status</span><span className="text-right">Leaves in</span>
          </div>
          <ul className="divide-y divide-line/60">
            {rows.map((r) => {
              const st = statusFor(r.depMins, now.mins, r.isArrival)
              const isNext = nextDep && r.train.no === nextDep.train.no && r.time === nextDep.time
              return (
                <li
                  key={`${r.train.no}-${r.time}`}
                  className={`grid grid-cols-[3.2rem_1fr_4.6rem_6.2rem_5.4rem] items-center gap-2 px-3 py-2.5 sm:grid-cols-[4rem_1fr_6rem_8rem_7rem] sm:px-4 ${
                    st.key === 'departed' ? 'opacity-35' : ''
                  } ${isNext ? 'bg-signal/10' : ''}`}
                >
                  <span className="font-board text-sm tracking-wider text-cream">{r.train.no}</span>
                  <span className="min-w-0">
                    <FlapText text={terminus(r.train)} className="text-xs sm:text-sm" />
                    <span className="mt-0.5 block truncate text-[10px] text-dim">{TYPES[r.train.type]}{r.train.days ? ' - ' + r.train.days.map((d) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(' & ') + ' only' : ''}</span>
                  </span>
                  <span className="text-right"><FlapText text={r.time} className="text-xs sm:text-sm" /></span>
                  <span className={`text-right font-board text-[10px] tracking-widest sm:text-xs ${
                    st.key === 'boarding' ? 'text-signal animate-pulse' : st.key === 'departed' ? 'text-dim' : 'text-ok'
                  }`}>{st.label}</span>
                  <span className="text-right font-board text-[10px] tracking-wider text-dim sm:text-xs">
                    {st.key === 'departed' ? '-' : countdown(r.depMins, now.mins, now.secs)}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        {/* planner */}
        <section className="mt-8 rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-board text-lg tracking-widest">WHICH TRAIN DO I CATCH?</h2>
            {!session && (
              <button
                onClick={() => { setAuthMode('up'); setAuthOpen(true) }}
                className="text-[11px] uppercase tracking-widest text-dim hover:text-signal"
              >
                Sign in to save trips
              </button>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select value={fromIdx} onChange={(e) => setFromIdx(Number(e.target.value))}
              className="rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-cream focus:border-signal focus:outline-none">
              {STATION_ORDER.map((s, i) => <option key={s} value={i}>From: {s}</option>)}
            </select>
            <button
              onClick={() => { const a = fromIdx; setFromIdx(toIdx); setToIdx(a) }}
              className="rounded-lg border border-line bg-panel2 px-3 py-2 text-signal transition hover:border-signal"
              aria-label="Swap stations"
            >
              ⇄
            </button>
            <select value={toIdx} onChange={(e) => setToIdx(Number(e.target.value))}
              className="rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-cream focus:border-signal focus:outline-none">
              {STATION_ORDER.map((s, i) => <option key={s} value={i}>To: {s}</option>)}
            </select>
          </div>
          {saveMsg && <p className="mt-3 text-xs text-signal">{saveMsg}</p>}
          {fromIdx === toIdx ? (
            <p className="mt-4 text-sm text-dim">Pick two different stations.</p>
          ) : plan.length === 0 ? (
            <p className="mt-4 text-sm text-dim">No more direct trains today between these stations. Try again after midnight.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {plan.map((p, i) => (
                <li key={p.train.no} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 ${i === 0 ? 'border-signal bg-signal/10' : 'border-line bg-panel2'}`}>
                  <div>
                    <span className="font-board text-sm tracking-wider text-cream">Train {p.train.no}</span>
                    <span className="ml-2 text-xs text-dim">{TYPES[p.train.type]}</span>
                    {i === 0 && <span className="ml-2 rounded-full bg-signal px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink">Best bet</span>}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <FlapText text={p.depTime} className="text-sm" />
                    <span className="text-dim">→</span>
                    <FlapText text={p.arrTime} className="text-sm" />
                    <span className="text-xs text-dim">{Math.floor(p.dur / 60) > 0 ? `${Math.floor(p.dur / 60)}h ` : ''}{p.dur % 60}m ride</span>
                    <span className="font-board text-xs tracking-wider text-signal">in {countdown(p.dep, now.mins, now.secs)}</span>
                    {session && (
                      <button
                        onClick={() => saveTrip(p)}
                        className="rounded-lg border border-line bg-panel px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-signal transition hover:border-signal"
                      >
                        Save
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* saved trips */}
        {session && trips.length > 0 && (
          <section className="mt-8 rounded-2xl border border-line bg-panel p-5 sm:p-6">
            <h2 className="font-board text-lg tracking-widest">MY SAVED TRIPS</h2>
            <ul className="mt-4 space-y-2">
              {trips.map((t, i) => (
                <li key={`${t.from}-${t.to}-${t.no}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel2 px-4 py-3">
                  <div>
                    <span className="text-sm text-cream">{STATION_ORDER[t.from]} → {STATION_ORDER[t.to]}</span>
                    <span className="ml-2 font-board text-xs tracking-wider text-dim">Train {t.no} - {TYPES[t.type] || ''}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <FlapText text={t.depTime} className="text-sm" />
                    <span className="text-dim">→</span>
                    <FlapText text={t.arrTime} className="text-sm" />
                    <button
                      onClick={() => removeTrip(i)}
                      className="text-[10px] uppercase tracking-wider text-dim hover:text-signal"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 pt-2 text-center text-[11px] leading-relaxed text-dim sm:px-6">
        Times from the Egyptian National Railways operating schedule published 25 Nov 2026.
        Schedules change - always confirm with ENR (enr.gov.eg) or at the station before you travel.
        Sleeper trains run on the days shown only.
      </footer>

      {authOpen && (
        <AuthModal
          mode={authMode}
          setMode={setAuthMode}
          onClose={() => setAuthOpen(false)}
          onDone={() => setAuthOpen(false)}
        />
      )}
    </div>
  )
}
