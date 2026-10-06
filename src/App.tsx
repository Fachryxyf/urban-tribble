import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import './styles/office.css'
import './styles/rooms.css'
import SlackChat, { ChatMessage } from './components/SlackChat'
import BriefDrawer from './components/BriefDrawer'
import Icon from './components/Icon'
import Character from './components/Character'
import FurnitureRenderer from './components/FurnitureRenderer'
import { Agent, OfficeEvent, AGENT_CONFIGS } from './types'
import { getCurrentPhase, getPhaseLabel, type DayPhase } from './daylight'
import { ROOMS } from './rooms'
import { useAgentSocket } from './hooks/useAgentSocket'
import * as sfx from './sounds'
import {
  assignSpot,
  createAgent,
  stepToward,
  findWaypointPath,
  WALK_SPEED,
  BREAK_MIN_DESK_TIME,
  BREAK_CHANCE_PER_SEC,
  BREAK_DURATION,
  spawnMessage,
  workMessage,
  doneMessage,
  coffeeMessage,
  waterMessage,
} from './agentManager'
import { BOSS_ROLE, BOSS_NAME } from './config'
import { pickEvent } from './events'
import { getInteraction } from './interactions'
import {
  useTheme, getRoomImage, getAngelaCat, getTheme,
  OFFICE_SIM_TOOL_MESSAGES, OFFICE_SIM_BOSS_PROMPTS,
  assignCharacterToRole, releaseRole, nextUnusedOfficeCharacter, displayNameFromSlug,
} from './theme'

// ---------------------------------------------------------------------------
// Placement helper — loaded via ?helper query param
// ---------------------------------------------------------------------------
const PlacementHelper = lazy(() => import('./components/PlacementHelper'))
const params = new URLSearchParams(window.location.search)
const isHelperMode = params.has('helper')
const isSimMode = params.has('sim') || params.has('video')
const isVideoMode = params.has('video')
// Why: allow ?theme=office on demo/sim URLs to preload Dunder Mifflin mode
import { setTheme as _setTheme } from './theme'
if (params.get('theme') === 'office') { _setTheme('office') }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeNow(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

let nextMsgId = 1
function makeMsgId() { return nextMsgId++ }

// Room spots for main office
const MAIN_ROOM = ROOMS['main-office' ]
const ENTRY = MAIN_ROOM.entryPoint           // door position (%)
const COFFEE_SPOT = MAIN_ROOM.agentSpots.find(s => s.type === 'coffee') ?? null
const WATER_SPOTS  = MAIN_ROOM.agentSpots.filter(s => s.type === 'water')

// Agent that is walking toward door to leave has this as targetPosition
const DOOR_TARGET = { x: ENTRY.x, y: ENTRY.y }

const FILING_SPOT = MAIN_ROOM.agentSpots.find(s => s.type === 'filing') ?? null

// Waypoints for the main office
const MAIN_WAYPOINTS = MAIN_ROOM.waypoints ?? []

/**
 * Compute a pathQueue from one position to another using the main-office
 * waypoint graph.  Returns an array of intermediate {x,y} steps — the agent
 * should walk through each in order, then continue straight to targetPosition.
 */
function computePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number }[] {
  if (MAIN_WAYPOINTS.length === 0) {
    console.warn('[pathfinding] No waypoints loaded!')
    return []
  }
  const path = findWaypointPath(from.x, from.y, to.x, to.y, MAIN_WAYPOINTS)
  console.log(`[pathfinding] from (${from.x.toFixed(1)},${from.y.toFixed(1)}) to (${to.x.toFixed(1)},${to.y.toFixed(1)}) → ${path.length} waypoints`, path)
  return path
}

// Role yang menuju lemari arsip, bukan meja (menelusuri dokumen)
const FILING_ROLES = new Set(['staff' ])

// 6 role Red Team: staf tetap, kursi permanen, masuk saat kantor dibuka
const RED_TEAM_ROLES = ['ketua', 'pengacara', 'risiko', 'fakta', 'ekonom', 'penulis'] as const

// The boss — always in the office, permanent desk (spot-1)
const BOSS_ID = `boss-${BOSS_NAME.toLowerCase()}`
const BOSS_SPOT = MAIN_ROOM.agentSpots.find(s => s.id === 'spot-1') ?? MAIN_ROOM.agentSpots.find(s => s.type === 'desk') ?? null

function createBoss(): Agent {
  const cfg = AGENT_CONFIGS[BOSS_ROLE] ?? AGENT_CONFIGS['default' ]
  const spot = BOSS_SPOT ?? { id: 'spot-temp', type: 'desk' as const, x: 28.9, y: 66 }
  const entry = MAIN_ROOM.entryPoint
  const target = { x: spot.x, y: spot.y }
  return {
    id: BOSS_ID,
    name: cfg.title,
    type: 'subagent',
    role: BOSS_ROLE,
    state: 'new-hire',
    position: { x: entry.x, y: entry.y },
    targetPosition: target,
    deskPosition: target,
    room: 'main-office',
    assignedRoom: 'main-office',
    assignedSpotId: spot.id,
    spriteFacing: spot.spriteFacing,
    task: 'Memimpin kantor',
    statusText: 'masuk kantor',
    color: cfg.color,
    icon: cfg.icon,
    hiredAt: Date.now(),
    pathQueue: computePath(entry, target),
  }
}

// Claude — the assistant, always in the office at spot-2
const CLAUDE_ID = 'assistant-claude'
const CLAUDE_ROLE = 'assistant'
const CLAUDE_SPOT = MAIN_ROOM.agentSpots.find(s => s.id === 'spot-2') ?? null

function createClaude(): Agent {
  const cfg = AGENT_CONFIGS[CLAUDE_ROLE] ?? AGENT_CONFIGS['default' ]
  const spot = CLAUDE_SPOT ?? { id: 'spot-2', type: 'desk' as const, x: 37.9, y: 68.2, spriteFacing: 'rear-right' as const }
  const entry = MAIN_ROOM.entryPoint
  const target = { x: spot.x, y: spot.y }
  return {
    id: CLAUDE_ID,
    name: cfg.title,
    type: 'subagent',
    role: CLAUDE_ROLE,
    state: 'new-hire',
    position: { x: entry.x, y: entry.y },
    targetPosition: target,
    deskPosition: target,
    room: 'main-office',
    assignedRoom: 'main-office',
    assignedSpotId: spot.id,
    spriteFacing: spot.spriteFacing,
    task: 'Asisten kantor',
    statusText: 'masuk kantor',
    color: cfg.color,
    icon: cfg.icon,
    hiredAt: Date.now() + 500, // arrives just after the boss
    pathQueue: computePath(entry, target),
  }
}

// How close (in %-units) an agent must be to their target before we consider
// them "arrived"
const ARRIVAL_THRESHOLD = 0.3

// ---------------------------------------------------------------------------
// Per-agent runtime metadata (not stored in Agent itself to avoid re-renders)
// ---------------------------------------------------------------------------
// Minimum time (ms) an agent stays visible after spawning before they can leave
const MIN_VISIBLE_TIME = 30_000

interface AgentMeta {
  /** Timestamp when agent spawned */
  spawnedAt: number
  /** Timestamp when agent arrived at their desk */
  arrivedAtDeskAt: number | null
  /** Timestamp when agent entered idle state */
  idleSince: number | null
  /** Is agent currently on a break (coffee/water) */
  onBreak: boolean
  /** When the break started */
  breakStartedAt: number | null
}

// ---------------------------------------------------------------------------
// Side-effect descriptor — computed during state updates, flushed after
// ---------------------------------------------------------------------------
type SfxEffect = 'doorOpen' | 'typing' | 'celebration' | 'coffee' | 'alarm' | 'error' | 'powerDown' | 'notification'

interface PendingEffect {
  msg?: { sender: string; role: string; color: string; text: string; isSystem?: boolean }
  sfx?: SfxEffect
  furnitureState?: { id: string; state: string }
}

// ---------------------------------------------------------------------------
// App component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Cinematic simulation data — realistic agent activity for screen recording
// ---------------------------------------------------------------------------
const SIM_SCENARIOS = [
  {
    role: 'ketua',
    task: 'Bedah brief & pecah jadi 4 vektor tugas',
    slackMessages: [
      'brief masuk. buzzword saya buang dulu',
      'satu keputusan inti tersisih: bertahan atau ekspansi',
      '4 vektor tugas terkunci di 00_brief_breakdown.md',
      'vektor dibagi. analis silakan mulai bedah',
    ],
  },
  {
    role: 'fakta',
    task: 'Audit angka & klaim di proposal ekspansi',
    slackMessages: [
      'klaim retensi 60 persen saya cek ke data kohort',
      'angka rill berhenti di 19 persen bulan ketiga',
      'angka pasar 10 triliun itu agregat global, bukan pasar kita',
      'audit selesai: 3 klaim tanpa sumber primer',
    ],
  },
  {
    role: 'ekonom',
    task: 'Uji unit economics & margin kontribusi',
    slackMessages: [
      'margin kontribusi saya hitung tanpa insentif promo',
      'per transaksi masih minus 400 rupiah',
      'butuh 4.200 transaksi bulanan untuk break-even',
      'payback 18 bulan, retensi 4 bulan. tidak masuk akal',
    ],
  },
]

// Extra random slack chatter between agents
const SIM_CHATTER = [
  { sender: 'Ketua Tim', role: 'ketua', msg: 'brief baru di folder. saya bedah dulu sebelum dibagi' },
  { sender: 'Penyelidik Fakta', role: 'fakta', msg: 'angka retensi itu tidak punya sumber primer' },
  { sender: 'Ekonom', role: 'ekonom', msg: 'margin kontribusi masih hijau karena insentif promo' },
  { sender: 'Analis Risiko', role: 'risiko', msg: 'payment gateway cuma satu vendor. itu celah' },
  { sender: 'Pengacara Bantah', role: 'pengacara', msg: 'asumsi loyalitas pengguna belum ada buktinya' },
  { sender: 'Penulis Memo', role: 'penulis', msg: 'memo final saya kunci setelah 5 berkas masuk' },
  { sender: 'Asisten', role: 'assistant', msg: 'printer macet lagi. ketiga kalinya hari ini.' },
  { sender: 'Asisten', role: 'assistant', msg: 'kopi di break room habis. ini darurat.' },
  { sender: 'Staff', role: 'staff', msg: 'lagi arsip dokumen lama di lemari belakang' },
  { sender: 'Ketua Tim', role: 'ketua', msg: 'arahan bos dicatat, lingkup kerja tidak boleh melebar' },
  { sender: 'Analis Risiko', role: 'risiko', msg: 'kill-switch sudah saya tulis. tinggal baca ambangnya' },
  { sender: BOSS_NAME, role: 'boss', msg: 'mau kopi gak?' },
  { sender: BOSS_NAME, role: 'boss', msg: 'angka bulan ini gimana?' },
  { sender: BOSS_NAME, role: 'boss', msg: 'rapat jam 3 jangan telat ya' },
]

// Obrolan gaya Dunder Mifflin — dipakai saat /the-office aktif
const OFFICE_SIM_CHATTER = [
  { sender: 'Ketua Tim', role: 'ketua', msg: 'nemu masalah lagi di arsip — Creed. lagi.' },
  { sender: 'Penulis Memo', role: 'penulis', msg: 'katalog baru lebih rapi dari meja Dwight' },
  { sender: 'Penyelidik Fakta', role: 'fakta', msg: 'awas — Dwight bikin simulasi kebakaran dadakan lagi' },
  { sender: 'Ekonom', role: 'ekonom', msg: 'jumlah rim kertas cocok. approved.' },
  { sender: 'Staff', role: 'staff', msg: 'daftar klien diurutkan alfabetis. seperti dulu kala.' },
  { sender: 'Analis Risiko', role: 'risiko', msg: 'muat truk pengiriman — mobil bit Schrute.' },
  { sender: 'Asisten', role: 'assistant', msg: 'Michael di ruang rapat. lagi. tolong.' },
  { sender: 'Penyelidik Fakta', role: 'fakta', msg: 'kualitas kertas diuji. tetap kertas. 94% kertas.' },
  { sender: 'Ekonom', role: 'ekonom', msg: 'printer panas 200ms lebih cepat. kemenangan kecil.' },
  { sender: 'Pengacara Bantah', role: 'pengacara', msg: 'materi promo di HP udah oke — sampai Creed sadar' },
  { sender: 'Asisten', role: 'assistant', msg: 'ambil printer, dia kebakar. kebakar beneran.' },
  { sender: 'Penulis Memo', role: 'penulis', msg: 'piagam Finer Things Club mulus sempurna' },
  { sender: 'Pengacara Bantah', role: 'pengacara', msg: 'ngajarin mesin fotokopi baca tulisan tangan Stanley' },
  { sender: 'Staff', role: 'staff', msg: 'false. itu bukan staples. itu Dwight.' },
  { sender: BOSS_NAME, role: 'boss', msg: "ke Chili's gak? pengen Baby Back Ribs." },
  { sender: BOSS_NAME, role: 'boss', msg: 'beresin. rapat besok. PARKOUR!' },
  { sender: BOSS_NAME, role: 'boss', msg: 'berapa rim yang kita geser hari ini?' },
  { sender: BOSS_NAME, role: 'boss', msg: "I'm not superstitious, but I am a little stitious." },
  { sender: 'Analis Risiko', role: 'risiko', msg: 'Bears. Beets. Battlestar Galactica.' },
  { sender: 'Penyelidik Fakta', role: 'fakta', msg: 'Identity theft is not a joke, Jim! Millions of families suffer every year!' },
  { sender: 'Ekonom', role: 'ekonom', msg: "that's what she said" },
  { sender: 'Pengacara Bantah', role: 'pengacara', msg: "I feel God in this Chili's tonight" },
  { sender: 'Penulis Memo', role: 'penulis', msg: 'Would I rather be feared or loved? Easy. Both.' },
  { sender: 'Ketua Tim', role: 'ketua', msg: 'I declare BANKRUPTCY' },
]

const App: React.FC = () => {
  // All hooks must be at the top — before any conditional returns.
  const theme = useTheme() // Why: re-render rooms + agents when /the-office toggles
  const [agents, setAgents] = useState<Agent[]>(() => [createBoss(), createClaude()])
  const agentMetaRef = useRef<Map<string, AgentMeta>>(new Map([
    [BOSS_ID, { spawnedAt: Date.now(), arrivedAtDeskAt: Date.now(), idleSince: null, onBreak: false, breakStartedAt: null }],
    [CLAUDE_ID, { spawnedAt: Date.now(), arrivedAtDeskAt: Date.now(), idleSince: null, onBreak: false, breakStartedAt: null }],
  ]))
  // Peta id event server (rt-<slug>-<role>) ke id staf tetap (rt-<role>)
  const idRedirectRef = useRef<Map<string, string>>(new Map())

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatTypingUser, setChatTypingUser] = useState<string | null>(null)
  const [lastSeenId, setLastSeenId] = useState<number | null>(null)
  const [muted, setMuted] = useState(false)
  const [dayPhase, setDayPhase] = useState<DayPhase>(getCurrentPhase())
  const [dayNightMode, setDayNightMode] = useState<'auto' | 'day' | 'night'>('auto')
  const [briefOpen, setBriefOpen] = useState(false)
  const [sceneScale, setSceneScale] = useState(1)
  const roomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = roomRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width
      if (w > 0) setSceneScale(w / 754)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Compressed day cycle: 10 min = 24 hours
  // nightOpacity: 0 = full day, 1 = full night
  const [nightOpacity, setNightOpacity] = useState(0)

  // Track interactive furniture state (coffee on/off, filing open/closed)
  const [furnitureStates, setFurnitureStates] = useState<Record<string, string>>({})

  // Visual flicker state for power-flicker event
  const [flickering, setFlickering] = useState(false)

  // Boss interaction cooldowns
  const interactionCooldowns = useRef<Map<string, number>>(new Map())

  // Boss interaction effect (shown above boss character)
  const [bossEffect, setBossEffect] = useState<string | null>(null)

  const handleFurnitureClick = useCallback((itemId: string) => {
    const interaction = getInteraction(itemId)
    if (!interaction) return

    // Check cooldown
    const now = Date.now()
    const lastUsed = interactionCooldowns.current.get(itemId) ?? 0
    if (now - lastUsed < interaction.cooldown) return
    interactionCooldowns.current.set(itemId, now)

    // Walk boss to the item
    const target = interaction.walkTo
    setAgents(prev => prev.map(a => {
      if (a.id !== BOSS_ID) return a
      return {
        ...a,
        state: 'walking-to-desk' as const,
        targetPosition: target,
        pathQueue: computePath(a.position, target),
        statusText: Array.isArray(interaction.chatMessage)
          ? interaction.chatMessage[Math.floor(Math.random() * interaction.chatMessage.length)]
          : interaction.chatMessage,
      }
    }))

    // Set up arrival watcher — when boss reaches target, trigger effects
    const checkArrival = setInterval(() => {
      const boss = agentsRef.current.find(a => a.id === BOSS_ID)
      if (!boss) { clearInterval(checkArrival); return }
      const dist = Math.sqrt((boss.position.x - target.x) ** 2 + (boss.position.y - target.y) ** 2)
      if (dist < 2) {
        clearInterval(checkArrival)

        // Play sound if specified
        if (interaction.sound === 'bell') sfx.playBell()
        else if (interaction.sound === 'notification') sfx.playNotification()
        else if (interaction.sound === 'coffee') sfx.playCoffee()

        // Show effect above boss
        setBossEffect(interaction.effect)
        setTimeout(() => setBossEffect(null), interaction.duration)

        // Post chat message
        const msg = Array.isArray(interaction.chatMessage)
          ? interaction.chatMessage[Math.floor(Math.random() * interaction.chatMessage.length)]
          : interaction.chatMessage
        const bossCfg = AGENT_CONFIGS[BOSS_ROLE] ?? AGENT_CONFIGS['default' ]
        // Use setMessages directly to avoid addMsg dependency ordering
        setMessages(prev => [...prev.slice(-50), {
          id: makeMsgId(),
          sender: bossCfg.title,
          senderSprite: BOSS_ROLE,
          senderColor: bossCfg.color,
          text: msg,
          channel: 'office-general',
          timestamp: timeNow(),
        }])

        // Furniture state change
        if (interaction.furnitureState) {
          const fs = interaction.furnitureState
          setFurnitureStates(prev => ({ ...prev, [fs.id]: fs.state }))
          if (fs.revertAfter) {
            setTimeout(() => {
              setFurnitureStates(prev => {
                const next = { ...prev }
                delete next[fs.id]
                return next
              })
            }, fs.revertAfter)
          }
        }

        // Walk boss back to desk after effect
        setTimeout(() => {
          setAgents(prev => prev.map(a => {
            if (a.id !== BOSS_ID) return a
            return {
              ...a,
              state: 'walking-to-desk' as const,
              targetPosition: { ...a.deskPosition },
              pathQueue: computePath(a.position, a.deskPosition),
              statusText: 'back to work',
            }
          }))
        }, interaction.duration + 500)
      }
    }, 200)

    // Safety: clear after 15s if boss never arrives
    setTimeout(() => clearInterval(checkArrival), 15000)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // We store agents in a ref as well so animation callbacks can read them
  // without needing to be re-created every render.
  const agentsRef = useRef<Agent[]>([])
  agentsRef.current = agents

  // Pending side-effects: computed during state updater, flushed in useEffect
  const pendingEffectsRef = useRef<PendingEffect[]>([])
  const recentChatKeysRef = useRef<Set<string>>(new Set())
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Agents currently showing typing indicator (before a Slack message)
  const [typingAgents, setTypingAgents] = useState<Set<string>>(new Set())

  // Video mode: auto-type text into the Slack input
  const [autoTypeText, setAutoTypeText] = useState<string | undefined>(undefined)

  // ---------------------------------------------------------------------------
  // Slack chat helpers
  // ---------------------------------------------------------------------------

  const addMsg = useCallback((
    sender: string,
    role: string,
    color: string,
    text: string,
    isSystem = false,
  ) => {
    setMessages(prev => [...prev.slice(-50), {
      id: makeMsgId(),
      sender,
      senderSprite: role,
      senderColor: color,
      text,
      channel: 'office-general',
      timestamp: timeNow(),
      isSystem,
      reactions: undefined,
    }])
  }, [])

  // ---------------------------------------------------------------------------
  // Flush side-effects after state updates
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const effects = pendingEffectsRef.current
    if (effects.length === 0) return
    pendingEffectsRef.current = []

    for (const fx of effects) {
      if (fx.msg && !fx.msg.isSystem) {
        // Show typing indicator 500ms before message appears
        const role = fx.msg.role
        const agentId = agents.find(a => a.role === role)?.id
        if (agentId) {
          setTypingAgents(prev => new Set(prev).add(agentId))
          setTimeout(() => {
            setTypingAgents(prev => {
              const next = new Set(prev)
              next.delete(agentId)
              return next
            })
            addMsg(fx.msg!.sender, fx.msg!.role, fx.msg!.color, fx.msg!.text, fx.msg!.isSystem)
          }, 500)
        } else {
          addMsg(fx.msg.sender, fx.msg.role, fx.msg.color, fx.msg.text, fx.msg.isSystem)
        }
      } else if (fx.msg) {
        addMsg(fx.msg.sender, fx.msg.role, fx.msg.color, fx.msg.text, fx.msg.isSystem)
      }
      if (fx.sfx && !sfx.isMuted()) {
        switch (fx.sfx) {
          case 'doorOpen':    sfx.playDoorOpen(); break
          case 'typing':      sfx.playTyping(); break
          case 'celebration': sfx.playCelebration(); break
          case 'coffee':      sfx.playCoffee(); break
          case 'alarm':       sfx.playAlarm(); break
          case 'error':       sfx.playError(); break
          case 'powerDown':   sfx.playPowerDown(); break
          case 'notification': sfx.playNotification(); break
        }
      }
      if (fx.furnitureState) {
        const { id, state } = fx.furnitureState
        setFurnitureStates(prev => ({ ...prev, [id]: state }))
      }
    }
  })

  // Boss & Claude arrival messages (ref guard prevents StrictMode double-fire)
  const arrivedRef = useRef(false)
  useEffect(() => {
    if (arrivedRef.current) return
    arrivedRef.current = true
    const bossCfg = AGENT_CONFIGS[BOSS_ROLE] ?? AGENT_CONFIGS['default' ]
    addMsg(bossCfg.title, BOSS_ROLE, bossCfg.color, 'masuk kantor')
    const claudeCfg = AGENT_CONFIGS[CLAUDE_ROLE] ?? AGENT_CONFIGS['default' ]
    setTimeout(() => {
      addMsg(claudeCfg.title, CLAUDE_ROLE, claudeCfg.color, 'masuk kantor')
    }, 1500)

    // 6 staf Red Team masuk bergantian lalu duduk di meja masing-masing
    RED_TEAM_ROLES.forEach((role, i) => {
      setTimeout(() => {
        const cfg = AGENT_CONFIGS[role] ?? AGENT_CONFIGS['default']
        handleEvent({
          type: 'agent_spawned',
          agent: { id: `rt-${role}`, name: cfg.title, role, task: 'menunggu brief dari Bos' },
        })
      }, 2500 + i * 900)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------------
  // Day/night cycle — compressed: 10 min = 24 hours
  // Timeline (600s total):
  //   0-60s:    dawn transition (night→day fade)
  //   60-300s:  daytime (full day)
  //   300-360s: dusk transition (day→night fade)
  //   360-600s: nighttime (full night)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const CYCLE_MS = 10 * 60 * 1000 // 10 minutes
    const startTime = Date.now()
    let lastPhase: DayPhase | null = null

    const tick = () => {
      const elapsed = (Date.now() - startTime) % CYCLE_MS
      const t = elapsed / 1000 // seconds into cycle

      let opacity: number
      let phase: DayPhase

      if (t < 60) {
        // Dawn: fade night→day (1→0)
        opacity = 1 - (t / 60)
        phase = 'dawn'
      } else if (t < 300) {
        // Daytime
        opacity = 0
        phase = t < 180 ? 'morning' :  'afternoon'
      } else if (t < 360) {
        // Dusk: fade day→night (0→1)
        opacity = (t - 300) / 60
        phase = 'dusk'
      } else {
        // Nighttime
        opacity = 1
        phase = 'night'
      }

      setNightOpacity(opacity)

      if (phase !== lastPhase) {
        lastPhase = phase
        setDayPhase(phase)
      }
    }

    tick() // initial
    const interval = setInterval(tick, 500) // update every 500ms for smooth fade
    return () => clearInterval(interval)
  }, [])

  // ---------------------------------------------------------------------------
  // WebSocket event handler
  // ---------------------------------------------------------------------------

  const handleEvent = useCallback((event: OfficeEvent) => {
    const effects: PendingEffect[] = []

    setAgents(prev => {
      switch (event.type) {
        // ── New agent spawned ────────────────────────────────────────────────
        case 'agent_spawned': {
          const raw = event.agent ?? {}
          const id   = raw.id   ?? `agent-${Date.now()}`
          const name = raw.name ?? 'Agent'
          const role = raw.role ?? 'staff'
          const task = raw.task

          // Already tracked? Skip.
          if (prev.some(a => a.id === id)) return prev

          // Staf Red Team permanen: arahkan ke kursi yang sudah ada, jangan duplikat
          if ((RED_TEAM_ROLES as readonly string[]).includes(role)) {
            const existing = prev.find(a => a.role === role)
            if (existing) {
              idRedirectRef.current.set(id, existing.id)
              const rcfg = AGENT_CONFIGS[role] ?? AGENT_CONFIGS['default']
              effects.push({
                msg: { sender: existing.name, role, color: rcfg.color, text: task ?? 'mulai kerja' },
                sfx: 'doorOpen',
              })
              return prev.map(a => a.id === existing.id
                ? { ...a, state: 'working' as const, statusText: task ?? a.statusText, task }
                : a)
            }
          }

          // Filing roles go to the filing cabinet, others get a desk
          const isFiler = FILING_ROLES.has(role)
          const filingTaken = isFiler && FILING_SPOT !== null && prev.some(a => a.assignedSpotId === FILING_SPOT.id)

          let spot
          if (isFiler && !filingTaken && FILING_SPOT !== null) {
            spot = FILING_SPOT
          } else {
            spot = assignSpot(prev, MAIN_ROOM.agentSpots)
          }

          if (!spot) {
            const cfg = AGENT_CONFIGS[role] ?? AGENT_CONFIGS['default' ]
            effects.push({ msg: { sender: name, role, color: cfg.color, text: 'waiting for a desk...' } })
            return prev
          }

          const agentBase = createAgent({ id, name, role, task, spot })
          const agent = {
            ...agentBase,
            pathQueue: computePath(agentBase.position, agentBase.targetPosition),
          }

          // Initialise runtime meta
          agentMetaRef.current.set(id, {
            spawnedAt: Date.now(),
            arrivedAtDeskAt: null,
            idleSince: null,
            onBreak: false,
            breakStartedAt: null,
          })

          const cfg = AGENT_CONFIGS[role] ?? AGENT_CONFIGS['default' ]
          effects.push({
            msg: { sender: name, role, color: cfg.color, text: task ? `${task}` : spawnMessage() },
            sfx: 'doorOpen',
          })

          return [...prev, agent]
        }

        // ── Agent started working / status update ──────────────────────────
        case 'agent_working': {
          const rawId = event.agentId ?? event.agent?.id
          const id = rawId ? (idRedirectRef.current.get(rawId) ?? rawId) : undefined
          const statusMsg = event.status ?? workMessage()

          if (id) {
            // Targeted update — specific agent
            return prev.map(a => {
              if (a.id !== id) return a
              const cfg = AGENT_CONFIGS[a.role] ?? AGENT_CONFIGS['default' ]
              effects.push({
                msg: { sender: a.name, role: a.role, color: cfg.color, text: `${statusMsg}` },
              })
              return { ...a, state: 'working' as const, statusText: statusMsg }
            })
          }

          // No agentId — broadcast to a random working agent (tool use from main thread)
          const workers = prev.filter(a => a.state === 'working' && a.id !== BOSS_ID)
          if (workers.length > 0) {
            const target = workers[Math.floor(Math.random() * workers.length)]
            const cfg = AGENT_CONFIGS[target.role] ?? AGENT_CONFIGS['default' ]
            effects.push({
              msg: { sender: target.name, role: target.role, color: cfg.color, text: `${statusMsg}` },
            })
            return prev.map(a =>
              a.id === target.id ? { ...a, statusText: statusMsg } : a
            )
          }

          return prev
        }

        // ── Agent completed task ─────────────────────────────────────────────
        case 'agent_completed': {
          const rawId = event.agentId ?? event.agent?.id
          if (!rawId) return prev
          const mapped = idRedirectRef.current.get(rawId)
          const id = mapped ?? rawId
          // Staf Red Team permanen: tugas selesai tetap duduk di meja
          if (mapped) {
            return prev.map(a => {
              if (a.id !== mapped) return a
              const cfg = AGENT_CONFIGS[a.role] ?? AGENT_CONFIGS['default']
              const doneMsg = event.result ?? 'tugas selesai'
              effects.push({ msg: { sender: a.name, role: a.role, color: cfg.color, text: doneMsg } })
              return { ...a, statusText: doneMsg }
            })
          }

          // Delay departure if agent hasn't been visible long enough
          const completeMeta = agentMetaRef.current.get(id)
          if (completeMeta) {
            const elapsed = Date.now() - completeMeta.spawnedAt
            if (elapsed < MIN_VISIBLE_TIME) {
              const delay = MIN_VISIBLE_TIME - elapsed
              setTimeout(() => handleEvent(event), delay)
              return prev
            }
          }

          return prev.map(a => {
            if (a.id !== id) return a
            const cfg = AGENT_CONFIGS[a.role] ?? AGENT_CONFIGS['default' ]
            const resultMsg = event.result ?? doneMessage()
            effects.push({
              msg: { sender: a.name, role: a.role, color: cfg.color, text: `${resultMsg}` },
              sfx: 'celebration',
            })

            // Boss replies to completed tasks
            const bossCfg = AGENT_CONFIGS[BOSS_ROLE] ?? AGENT_CONFIGS['default' ]
            const bossReplies = [
              `keren ${a.name} `,
              `mantap `,
              `gas lanjut!`,
              `bagus, ngopi dulu sana`,
              `top `,
              `bagus, siapa berikutnya?`,
              `cepat juga ya`,
              `rapi `,
              `thanks ${a.name}`,
              `oke. tugas berikutnya...`,
            ]
            // Why: when Office theme is on, Michael Scott occasionally lands his signature line.
            const isMichael = getTheme() === 'office'
            const reply = isMichael && Math.random() < 0.25
              ? `That's what she said`
              : bossReplies[Math.floor(Math.random() * bossReplies.length)]
            effects.push({
              msg: { sender: bossCfg.title, role: BOSS_ROLE, color: bossCfg.color, text: reply },
            })

            // Mark as completed and start walking to door
            const meta = agentMetaRef.current.get(a.id)
            if (meta) {
              meta.arrivedAtDeskAt = null
              meta.onBreak = false
            }
            // Close filing cabinet if this agent was using it
            if (a.assignedSpotId === 'spot-filing') {
              effects.push({ furnitureState: { id: 'filing-1', state: 'closed' } })
            }

            return {
              ...a,
              state: 'completed' as const,
              targetPosition: { ...DOOR_TARGET },
              statusText: event.result ?? doneMessage(),
              pathQueue: computePath(a.position, DOOR_TARGET),
            }
          })
        }

        // ── MCP call started ─────────────────────────────────────────────────
        case 'mcp_call': {
          const server = (event as any).server ?? ''
          const tool = (event as any).tool ?? ''
          const id = event.agentId ?? event.agent?.id
          if (!id) return prev
          const mcpMsg = `${server} → ${tool}`
          return prev.map(a => {
            if (a.id !== id) return a
            const cfg = AGENT_CONFIGS[a.role] ?? AGENT_CONFIGS['default' ]
            effects.push({ msg: { sender: a.name, role: a.role, color: cfg.color, text: mcpMsg } })
            return { ...a, statusText: `${server}.${tool}`}
          })
        }

        // ── MCP call finished ────────────────────────────────────────────────
        case 'mcp_done': {
          const id = event.agentId ?? event.agent?.id
          if (!id) return prev
          return prev.map(a =>
            a.id === id
              ? { ...a, statusText: event.result ?? 'done' }
              : a
          )
        }

        // ── Typing indicator ─────────────────────────────────────────────
        case 'chat_typing': {
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
          setChatTypingUser((event as any).sender ?? '')
          typingTimeoutRef.current = setTimeout(() => setChatTypingUser(null), 10000)
          return prev
        }

        // ── Emoji reactions on a message ──────────────────────────────────
        case 'chat_reaction': {
          const { messageId, reactions } = event as any
          if (messageId && reactions) {
            setMessages(prev => prev.map(m =>
              m.id === messageId ? { ...m, reactions } : m
            ))
          }
          return prev
        }

        // ── Read receipt ──────────────────────────────────────────────────
        case 'chat_seen': {
          setLastSeenId((event as any).messageId ?? null)
          return prev
        }

        // ── Chat message from server (Claude replying via an agent) ──────
        case 'chat_message': {
          const sender = event.sender ?? 'Agent'
          const text = event.text ?? ''
          const ts = (event as any).timestamp as number | undefined

          // Clear typing indicator when Claude sends a real message
          setChatTypingUser(null)

          // Skip messages from the boss — those are added locally by onSendMessage
          const bossCfg = AGENT_CONFIGS[BOSS_ROLE] ?? AGENT_CONFIGS['default' ]
          if (sender === bossCfg.title || sender.toLowerCase() === bossCfg.title.toLowerCase()) {
            return prev
          }

          // Deduplicate by timestamp+text — skip if we already have this exact message
          const dedupKey = `${ts ?? 0}:${text}`
          if (recentChatKeysRef.current.has(dedupKey)) {
            return prev
          }
          recentChatKeysRef.current.add(dedupKey)
          // Keep the set from growing unbounded
          if (recentChatKeysRef.current.size > 50) {
            const first = recentChatKeysRef.current.values().next().value
            if (first !== undefined) recentChatKeysRef.current.delete(first)
          }

          const role = (event as any).role as string | undefined
          let msgSender: string, msgRole: string, msgColor: string

          // Kalau pengirim balasan AI (dari watcher), selalu atribusikan ke Asisten
          if (['claude', 'asisten' ].includes(sender.toLowerCase())) {
            const claudeCfg = AGENT_CONFIGS[CLAUDE_ROLE] ?? AGENT_CONFIGS['default' ]
            msgSender = claudeCfg.title; msgRole = CLAUDE_ROLE; msgColor = claudeCfg.color
          } else if (role && AGENT_CONFIGS[role]) {
            const cfg = AGENT_CONFIGS[role]
            msgSender = cfg.title; msgRole = role; msgColor = cfg.color
          } else {
            // Attribute to a working agent or fall back to Claude
            const workers = prev.filter(a => a.id !== BOSS_ID && a.id !== CLAUDE_ID && a.state === 'working')
            if (workers.length > 0) {
              const agent = workers[Math.floor(Math.random() * workers.length)]
              const cfg = AGENT_CONFIGS[agent.role] ?? AGENT_CONFIGS['default' ]
              msgSender = agent.name; msgRole = agent.role; msgColor = cfg.color
            } else {
              const claudeCfg = AGENT_CONFIGS[CLAUDE_ROLE] ?? AGENT_CONFIGS['default' ]
              msgSender = claudeCfg.title; msgRole = CLAUDE_ROLE; msgColor = claudeCfg.color
            }
          }
          // Use setTimeout to escape the setAgents updater before calling addMsg
          setTimeout(() => addMsg(msgSender, msgRole, msgColor, text), 0)
          return prev
        }

        default:
          return prev
      }
    })

    // Schedule effects to be flushed after state settles
    pendingEffectsRef.current.push(...effects)
  }, [])

  // ---------------------------------------------------------------------------
  // WebSocket connection
  // ---------------------------------------------------------------------------

  useAgentSocket({ onEvent: handleEvent, url: 'ws://localhost:3334/ws', disabled: isSimMode })

  // ---------------------------------------------------------------------------
  // Simulation loop — spawns/completes fake agents (only in ?sim mode)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isSimMode) return
    const timers: ReturnType<typeof setTimeout>[] = []
    const intervals: ReturnType<typeof setInterval>[] = []

    // ---- Office-theme rotation sim: 10 staff, constant door churn, cycles all 22 ----
    if (getTheme() === 'office' && !isVideoMode) {
      // Why: roles are synthetic "dm-0..dm-9" so each slot gets its own cast entry
      const STAFF_COUNT = 10
      const ROTATION_MS = 9000 // Why: fast enough to see all 22 in <2 min
      const ROLES = ['ketua', 'pengacara', 'risiko', 'fakta', 'ekonom', 'penulis' ] as const
      let lastRetired: string | null = null

      const spawnSlot = (slotIdx: number, initialDelay = 0) => {
        const role = `dm-slot-${slotIdx}`
        const baseRole = ROLES[slotIdx % ROLES.length]
        const cfg = AGENT_CONFIGS[baseRole] ?? AGENT_CONFIGS['default' ]
        const slug = nextUnusedOfficeCharacter(new Set(lastRetired ? [lastRetired] : []))
        const displayName = displayNameFromSlug(slug)

        timers.push(setTimeout(() => {
          // Why: force this synthetic role to map to the chosen Office character
          assignCharacterToRole(role, slug)
          handleEvent({
            type: 'agent_spawned',
            agent: {
              id: `dm-${slotIdx}-${Date.now()}`,
              name: displayName,
              role, // synthetic — so castByRole maps uniquely
              task: `Dunder Mifflin — ${displayName}`,
            },
          })
          timers.push(setTimeout(() => {
            addMsg(displayName, role, cfg.color, `masuk kantor — ${displayName} lapor`)
          }, 1000))
        }, initialDelay))
      }

      // Spawn 10 staff staggered over first 8s
      for (let i = 0; i < STAFF_COUNT; i++) {
        spawnSlot(i, i * 800)
      }

      // Rotation: every ROTATION_MS, retire oldest agent, spawn a new one in its slot
      let nextSlotToRotate = 0
      intervals.push(setInterval(() => {
        const slotIdx = nextSlotToRotate % STAFF_COUNT
        nextSlotToRotate++
        const role = `dm-slot-${slotIdx}`

        // Find the current agent for this slot and complete it (walks to door, exits)
        setAgents(prev => {
          const agent = prev.find(a => a.role === role)
          if (agent) {
            lastRetired = null // will be set after release
            handleEvent({
              type: 'agent_completed',
              agentId: agent.id,
              result: `${agent.name} heading out for a pretzel`,
            })
          }
          return prev
        })

        // After the exit animation, release the cast slot and spawn replacement
        timers.push(setTimeout(() => {
          releaseRole(role)
          spawnSlot(slotIdx, 800) // small gap before new hire walks in
        }, 3500))
      }, ROTATION_MS))

      // Periodic Office chatter from random staff
      intervals.push(setInterval(() => {
        setAgents(prev => {
          const staff = prev.filter(a => a.role.startsWith('dm-slot-'))
          if (staff.length === 0) return prev
          const speaker = staff[Math.floor(Math.random() * staff.length)]
          const lines = OFFICE_SIM_TOOL_MESSAGES[ROLES[parseInt(speaker.role.split('-')[2], 10) % ROLES.length]] ?? []
          const line = lines[Math.floor(Math.random() * lines.length)] ?? 'jual kertas'
          const cfg = AGENT_CONFIGS[ROLES[0]] ?? AGENT_CONFIGS['default' ]
          addMsg(speaker.name, speaker.role, cfg.color, line)
          return prev
        })
      }, 4500))

      return () => {
        timers.forEach(t => clearTimeout(t))
        intervals.forEach(i => clearInterval(i))
      }
    }

    // Helper: post a message with an optional typing indicator beforehand.
    // showTyping=true will set a typing state for ~1.5s before the message appears.
    const postWithTyping = (
      sender: string,
      role: string,
      msg: string,
      delay: number,
      showTyping: boolean,
    ) => {
      if (showTyping) {
        timers.push(setTimeout(() => {
          setChatTypingUser(sender)
        }, delay))
        timers.push(setTimeout(() => {
          const cfg = AGENT_CONFIGS[role] ?? AGENT_CONFIGS['default' ]
          setChatTypingUser(null)
          addMsg(sender, role, cfg.color, msg)
        }, delay + 1500))
      } else {
        timers.push(setTimeout(() => {
          const cfg = AGENT_CONFIGS[role] ?? AGENT_CONFIGS['default' ]
          addMsg(sender, role, cfg.color, msg)
        }, delay))
      }
    }

    // Helper: add a random emoji reaction to the second-to-last chat message.
    const reactToLastMsg = (delay: number) => {
      timers.push(setTimeout(() => {
        setMessages(prev => {
          const target = prev[prev.length - 2]
          if (target && !target.reactions?.length) {
            const icon = ['like', 'fire', 'star', 'rocket', 'party' ][Math.floor(Math.random() * 5)]
            return prev.map(m => m.id === target.id ? { ...m, reactions: [icon] } : m)
          }
          return prev
        })
      }, delay))
    }

    // Phase 1: Stagger-spawn 3 agents (1s, 3s, 5s) with proactive "starting:" messages
    SIM_SCENARIOS.forEach((sim, i) => {
      const cfg = AGENT_CONFIGS[sim.role] ?? AGENT_CONFIGS['default' ]
      const spawnAt = 1000 + i * 2500
      timers.push(setTimeout(() => {
        handleEvent({
          type: 'agent_spawned',
          agent: {
            id: `sim-${sim.role}`,
            name: cfg.title,
            role: sim.role,
            task: sim.task,
          },
        })
        // Proactive "starting:" message a moment after spawn
        timers.push(setTimeout(() => {
          addMsg(cfg.title, sim.role, cfg.color, `mulai: ${sim.task}`)
        }, 1200))
      }, spawnAt))
    })

    // Phase 2: Drip-feed task progress messages
    const msgIndexes = SIM_SCENARIOS.map(() => 0)
    timers.push(setTimeout(() => {
      const progressInterval = setInterval(() => {
        // Pick a random agent to send a progress update
        const idx = Math.floor(Math.random() * SIM_SCENARIOS.length)
        const sim = SIM_SCENARIOS[idx]
        const msgIdx = msgIndexes[idx]
        if (msgIdx < sim.slackMessages.length) {
          const cfg = AGENT_CONFIGS[sim.role] ?? AGENT_CONFIGS['default' ]
          // Show typing indicator before every other progress message
          const useTyping = msgIdx % 2 === 0
          if (useTyping) {
            setChatTypingUser(cfg.title)
            timers.push(setTimeout(() => {
              setChatTypingUser(null)
              addMsg(cfg.title, sim.role, cfg.color, sim.slackMessages[msgIdx])
            }, 1500))
          } else {
            addMsg(cfg.title, sim.role, cfg.color, sim.slackMessages[msgIdx])
          }
          msgIndexes[idx]++

          // Add a reaction to the previous message after a short delay
          reactToLastMsg(3000)

          // Trigger ultra-think powerup on specific messages
          if (sim.slackMessages[msgIdx].includes('retensi') ||
              sim.slackMessages[msgIdx].includes('margin') ||
              sim.slackMessages[msgIdx].includes('vektor')) {
            setAgents(prev => prev.map(a =>
              a.role === sim.role
                ? { ...a, statusText: 'fokus: analisis detail...' }
                : a
            ))
            // Clear ultra-think after a few seconds
            timers.push(setTimeout(() => {
              setAgents(prev => prev.map(a =>
                a.role === sim.role
                  ? { ...a, statusText: sim.slackMessages[msgIdx] }
                  : a
              ))
            }, 8000))
          }
        }
      }, 4000)
      intervals.push(progressInterval)
    }, 12000)) // start after agents have settled at desks

    // Phase 3: Random chatter between agents — typing indicator on every 3rd message
    timers.push(setTimeout(() => {
      let chatterIdx = 0
      const chatterInterval = setInterval(() => {
        // Why: pool chosen at fire time so /the-office toggle mid-sim swaps the chatter instantly
        const pool = getTheme() === 'office' ? OFFICE_SIM_CHATTER : SIM_CHATTER
        if (chatterIdx >= pool.length) {
          chatterIdx = 0 // loop
        }
        const chat = pool[chatterIdx]
        const showTyping = chatterIdx % 3 === 0
        postWithTyping(chat.sender, chat.role, chat.msg, 0, showTyping)

        // React to the previous message after some chatter
        if (chatterIdx % 4 === 2) {
          reactToLastMsg(4000)
        }

        chatterIdx++
      }, 7000)
      intervals.push(chatterInterval)
    }, 18000))

    // Phase 4: Staff arsip masuk di tengah jalan (menelusuri dokumen lama)
    timers.push(setTimeout(() => {
      const staffCfg = AGENT_CONFIGS['staff' ] ?? AGENT_CONFIGS['default' ]
      handleEvent({
        type: 'agent_spawned',
        agent: {
          id: 'sim-staff',
          name: staffCfg.title,
          role: 'staff',
          task: 'Menelusuri arsip dokumen lama',
        },
      })
      timers.push(setTimeout(() => {
        addMsg(staffCfg.title, 'staff', staffCfg.color, 'mulai: Menelusuri arsip dokumen lama')
      }, 1200))
      // Staff selesai & keluar setelah 20 detik
      timers.push(setTimeout(() => {
        handleEvent({
          type: 'agent_completed',
          agentId: 'sim-staff',
          result: '12 dokumen terarsip di 4 folder',
        })
        timers.push(setTimeout(() => {
          addMsg(staffCfg.title, 'staff', staffCfg.color, 'selesai: 12 dokumen terarsip di 4 folder')
        }, 800))
      }, 20000))
    }, 25000))

    // Phase 5: Analis selesai tugas, jalan ke pintu, keluar — lalu Penulis Memo masuk
    timers.push(setTimeout(() => {
      handleEvent({
        type: 'agent_completed',
        agentId: 'sim-ekonom',
        result: 'Feasibility selesai: verdict capital trap',
      })
      timers.push(setTimeout(() => {
        const ekonomCfg = AGENT_CONFIGS['ekonom' ] ?? AGENT_CONFIGS['default' ]
        addMsg(ekonomCfg.title, 'ekonom', ekonomCfg.color, 'selesai: 04_financial_feasibility.md. verdict capital trap')
      }, 800))
      // Staf pengganti datang
      timers.push(setTimeout(() => {
        const cfg = AGENT_CONFIGS['penulis' ] ?? AGENT_CONFIGS['default' ]
        handleEvent({
          type: 'agent_spawned',
          agent: {
            id: 'sim-penulis',
            name: cfg.title,
            role: 'penulis',
            task: 'Kunci memo eksekutif 1 halaman',
          },
        })
        timers.push(setTimeout(() => {
          addMsg(cfg.title, 'penulis', cfg.color, 'mulai: Kunci memo eksekutif 1 halaman')
        }, 1200))
      }, 8000))
    }, 50000))

    return () => {
      timers.forEach(t => clearTimeout(t))
      intervals.forEach(i => clearInterval(i))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------------
  // Video mode — scripted demo for TikTok recording (?video)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isVideoMode) return
    const timers: ReturnType<typeof setTimeout>[] = []
    const bossCfg = AGENT_CONFIGS[BOSS_ROLE] ?? AGENT_CONFIGS['default' ]

    const officeSim0 = getTheme() === 'office'

    // 0-3s: Office is just Antony, settling in
    timers.push(setTimeout(() => {
      addMsg(bossCfg.title, BOSS_ROLE, bossCfg.color,
        officeSim0 ? "World's Best Boss clocked in, let's sell some paper" : 'masuk kantor, semangat!')
    }, 2000))

    // 4s: Antony types a question in Slack
    timers.push(setTimeout(() => {
      setAutoTypeText(officeSim0
        ? (OFFICE_SIM_BOSS_PROMPTS[0] ?? 'brief baru: evaluasi ekspansi ke Jawa Timur')
        : 'brief baru: evaluasi ekspansi ke Jawa Timur')
    }, 4000))

    // 8s: 3 agents spawn with ultra-think tasks (energy drinks!)
    timers.push(setTimeout(() => {
      const spawns = [
        { id: 'vid-ketua', role: 'ketua', name: 'Ketua Tim', task: 'fokus: bedah brief jadi 4 vektor tugas' },
        { id: 'vid-fakta', role: 'fakta', name: 'Penyelidik Fakta', task: 'fokus: audit angka & klaim proposal' },
        { id: 'vid-ekonom', role: 'ekonom', name: 'Ekonom', task: 'fokus: uji margin & break-even' },
      ]
      spawns.forEach((s, i) => {
        timers.push(setTimeout(() => {
          handleEvent({ type: 'agent_spawned', agent: s })
        }, i * 2000))
      })
    }, 8000))

    // 16s: Realistic tool output messages in Slack.
    // Why: swap to Office-themed chatter when /the-office mode is on at sim start
    const isOfficeSim = getTheme() === 'office'
    const defaultToolMessages = [
      { t: 16000, sender: 'Ketua Tim', role: 'ketua', text: 'buka brief terbaru dari folder kerja' },
      { t: 18000, sender: 'Penyelidik Fakta', role: 'fakta', text: 'tarik data kohort retensi bulan lalu' },
      { t: 20000, sender: 'Ketua Tim', role: 'ketua', text: '4 vektor tugas terkunci di 00_brief_breakdown.md' },
      { t: 22000, sender: 'Ekonom', role: 'ekonom', text: 'hitung margin kontribusi tanpa insentif promo' },
      { t: 24000, sender: 'Penyelidik Fakta', role: 'fakta', text: 'klaim TAM tanpa sumber primer, ditandai' },
      { t: 26000, sender: 'Ekonom', role: 'ekonom', text: 'butuh 4.200 transaksi bulanan untuk break-even' },
      { t: 28000, sender: 'Penyelidik Fakta', role: 'fakta', text: 'kontradiksi aritmetika antara target dan kapasitas' },
      { t: 30000, sender: 'Ketua Tim', role: 'ketua', text: 'lingkup diperketat, Analis Risiko mulai peta ancaman' },
    ]
    const toolMessages = isOfficeSim
      ? defaultToolMessages.map((m, i) => {
          const pool = OFFICE_SIM_TOOL_MESSAGES[m.role] ?? []
          return { ...m, text: pool[i % pool.length] ?? m.text }
        })
      : defaultToolMessages
    toolMessages.forEach(({ t, sender, role, text }) => {
      timers.push(setTimeout(() => {
        const cfg = AGENT_CONFIGS[role] ?? AGENT_CONFIGS['default' ]
        addMsg(sender, role, cfg.color, text)
      }, t))
    })

    // 25s: Antony types a follow-up
    timers.push(setTimeout(() => {
      setAutoTypeText(isOfficeSim ? (OFFICE_SIM_BOSS_PROMPTS[1] ?? 'gimana angka penjualan kita?') : 'gimana angka penjualan kita?')
    }, 25000))

    // 27s: Agent replies
    timers.push(setTimeout(() => {
      const cfg = AGENT_CONFIGS['ekonom' ] ?? AGENT_CONFIGS['default' ]
      addMsg('Ekonom', 'ekonom', cfg.color,
        isOfficeSim
          ? 'kritis — level parah ala Dwight. semua angka saya audit ulang sekarang'
          : 'margin kontribusi negatif. break-even butuh 4.200 transaksi bulanan')
    }, 27500))

    // 30s: Random chatter
    timers.push(setTimeout(() => {
      const cfg = AGENT_CONFIGS['penulis' ] ?? AGENT_CONFIGS['default' ]
      addMsg('Penulis Memo', 'penulis', cfg.color,
        isOfficeSim ? 'beresin arsip? gampang — lebih gampang dari ngatur Dundies' :  '5 berkas analis belum lengkap. memo final saya tahan dulu')
    }, 30000))

    timers.push(setTimeout(() => {
      const cfg = AGENT_CONFIGS['fakta' ] ?? AGENT_CONFIGS['default' ]
      addMsg('Penyelidik Fakta', 'fakta', cfg.color,
        isOfficeSim ? 'approved. cabang Stamford, gas. boom. roasted.' :  '3 klaim dikontradiksi, 2 klaim tanpa sumber primer')
    }, 32000))

    // 33s: Antony checks status with a slash command
    timers.push(setTimeout(() => {
      setAutoTypeText('/laporan')
    }, 33000))

    // 35s: Staff arsip masuk menelusuri dokumen
    timers.push(setTimeout(() => {
      handleEvent({
        type: 'agent_spawned',
        agent: { id: 'vid-staff', name: 'Staff', role: 'staff', task: 'Menelusuri arsip dokumen terkait' },
      })
    }, 35000))

    // 38s: Pizza delivery event!
    timers.push(setTimeout(() => {
      addMsg('system', 'default', '#8b8d91',
        officeSim0 ? 'IT\'S PRETZEL DAY' :  'Pizza sampai! Makan siang gratis!', true)
      addMsg(bossCfg.title, BOSS_ROLE, bossCfg.color,
        officeSim0 ? "You don't understand. It's pretzel day." : 'Pizza di lobi!')
      // Move all agents to door
      setAgents(prev => prev.map(a => ({
        ...a,
        state: 'walking-to-desk' as const,
        targetPosition: { x: 67.5, y: 48.9 },
        pathQueue: computePath(a.position, { x: 67.5, y: 48.9 }),
        statusText: 'Pizza Delivery',
      })))
      // Back to desks after 5s
      timers.push(setTimeout(() => {
        setAgents(prev => prev.map(a => ({
          ...a,
          state: 'walking-to-desk' as const,
          targetPosition: { ...a.deskPosition },
          pathQueue: computePath(a.position, a.deskPosition),
          statusText: 'back to work',
        })))
      }, 5000))
    }, 38000))

    // 45s: Agent chatter after pizza/pretzels
    timers.push(setTimeout(() => {
      const cfg = AGENT_CONFIGS['ekonom' ] ?? AGENT_CONFIGS['default' ]
      addMsg('Ekonom', 'ekonom', cfg.color,
        officeSim0 ? 'all the toppings. Stanley has been waiting all year.' :  'nanas di pizza itu masalah serius')
    }, 46000))

    timers.push(setTimeout(() => {
      const cfg = AGENT_CONFIGS['penulis' ] ?? AGENT_CONFIGS['default' ]
      addMsg('Penulis Memo', 'penulis', cfg.color,
        officeSim0 ? "that's what she said" : '')
    }, 47500))

    // 48s: Security completes
    timers.push(setTimeout(() => {
      handleEvent({
        type: 'agent_completed',
        agentId: 'vid-ketua',
        result: officeSim0
          ? 'Audit beres — bit aman. 3 masalah kritis dicatat di Schrute Manual.'
          : 'Bedah brief selesai: 4 vektor terkunci di 00_brief_breakdown.md',
      })
    }, 48000))

    // 52s: Explorer completes
    timers.push(setTimeout(() => {
      handleEvent({
        type: 'agent_completed',
        agentId: 'vid-staff',
        result: officeSim0 ? '8 dokumen ditemukan — semua diarsipkan di folder B untuk "Beet".' :  '8 dokumen ditemukan, semua sudah diarsipkan',
      })
    }, 52000))

    // 55s: Antony wraps up
    timers.push(setTimeout(() => {
      setAutoTypeText(officeSim0 ? 'great work team — boom. roasted.' : 'kerja bagus tim!')
    }, 55000))

    // 58s: Remaining agents complete
    timers.push(setTimeout(() => {
      handleEvent({ type: 'agent_completed', agentId: 'vid-fakta',
        result: officeSim0 ? 'Semua absensi tervalidasi — approve-nya Jim.' :  'Audit selesai: 3 klaim dikontradiksi, 2 tanpa sumber' })
    }, 58000))

    timers.push(setTimeout(() => {
      handleEvent({ type: 'agent_completed', agentId: 'vid-ekonom',
        result: officeSim0 ? 'Dokumen diunggah — Kevin ambil setengah buat chili-nya.' :  'Feasibility selesai: break-even 4.200 transaksi per bulan' })
    }, 60000))

    return () => timers.forEach(t => clearTimeout(t))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------------
  // Animation loop — moves agents toward their targets each frame
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let rafId: number
    let lastTime = performance.now()

    function tick(now: number) {
      const dt = Math.min((now - lastTime) / 16.67, 3)
      lastTime = now

      const prev = agentsRef.current
      if (prev.length === 0) {
        rafId = requestAnimationFrame(tick)
        return
      }

      const nowMs = Date.now()
      let changed = false

      const next = prev.map(agent => {
        const meta = agentMetaRef.current.get(agent.id) ?? {
          spawnedAt: Date.now(),
          arrivedAtDeskAt: null,
          idleSince: null,
          onBreak: false,
          breakStartedAt: null,
        }
        agentMetaRef.current.set(agent.id, meta)

        const speed = WALK_SPEED * dt

        // Walk toward the first waypoint in the queue, or directly to the
        // final targetPosition if the queue is empty.
        const queue = agent.pathQueue ?? []
        const immediateTarget = queue.length > 0 ? queue[0] : agent.targetPosition

        const { position, arrived } = stepToward(
          agent.position,
          immediateTarget,
          speed,
        )

        // Always update position (even if not arrived — this is the walking animation)
        const moved = position.x !== agent.position.x || position.y !== agent.position.y
        if (moved && agent.state !== 'working' && agent.state !== 'idle') {
          // Debug: log first few frames of movement
          if (Math.random() < 0.01) {
            const q = agent.pathQueue ?? []
            console.log(`[walk] ${agent.name} at (${agent.position.x.toFixed(1)},${agent.position.y.toFixed(1)}) → (${position.x.toFixed(1)},${position.y.toFixed(1)}) queue:${q.length} target:(${immediateTarget.x.toFixed(1)},${immediateTarget.y.toFixed(1)}) arrived:${arrived}`)
          }
        }
        let updated: Agent = moved
          ? (changed = true, { ...agent, position })
          : agent

        if (arrived) {
          // If there are more waypoints in the queue, pop the first one and
          // keep walking — don't trigger "arrived at final destination" yet.
          if (queue.length > 0) {
            const newQueue = queue.slice(1)
            updated = { ...agent, position, pathQueue: newQueue }
            changed = true
          } else {
            // Queue is empty — agent has reached (or is walking directly to)
            // their final targetPosition.
            const isAtDesk = (
              Math.abs(agent.targetPosition.x - agent.deskPosition.x) < ARRIVAL_THRESHOLD &&
              Math.abs(agent.targetPosition.y - agent.deskPosition.y) < ARRIVAL_THRESHOLD
            )
            const isAtDoor = (
              Math.abs(agent.targetPosition.x - DOOR_TARGET.x) < ARRIVAL_THRESHOLD &&
              Math.abs(agent.targetPosition.y - DOOR_TARGET.y) < ARRIVAL_THRESHOLD
            )

            if (agent.state === 'new-hire' || agent.state === 'walking-to-desk') {
              if (isAtDesk || agent.state === 'new-hire') {
                meta.arrivedAtDeskAt = nowMs
                meta.onBreak = false
                // Open filing cabinet if this agent's desk is the filing spot
                if (agent.assignedSpotId === 'spot-filing') {
                  setFurnitureStates(prev => ({ ...prev, 'filing-1': 'open' }))
                }
                updated = { ...agent, position, state: 'working', statusText: workMessage() }
                changed = true
              }
            } else if (agent.state === 'completed' && isAtDoor) {
              updated = { ...agent, position }
              changed = true
            } else if (agent.state === 'coffee-break') {
              if (!meta.onBreak) {
                meta.onBreak = true
                meta.breakStartedAt = nowMs
                // Toggle furniture state on arrival
                if (COFFEE_SPOT !== null && agent.id !== BOSS_ID) {
                  const atCoffee = Math.abs(position.x - COFFEE_SPOT.x) < 3 && Math.abs(position.y - COFFEE_SPOT.y) < 3
                  if (atCoffee) {
                    setFurnitureStates(prev => ({ ...prev, coffee: 'on' }))
                  }
                }
                const filingSpot = MAIN_ROOM.agentSpots.find(s => s.type === 'filing')
                const atFiling = filingSpot && Math.abs(position.x - filingSpot.x) < 3 && Math.abs(position.y - filingSpot.y) < 3
                if (atFiling) {
                  setFurnitureStates(prev => ({ ...prev, 'filing-1': 'open' }))
                }
                updated = { ...agent, position }
                changed = true
              } else {
                const waited = nowMs - (meta.breakStartedAt ?? nowMs)
                if (waited >= BREAK_DURATION) {
                  meta.onBreak = false
                  meta.breakStartedAt = null
                  meta.arrivedAtDeskAt = nowMs
                  // Toggle furniture state back on departure
                  setFurnitureStates(prev => ({ ...prev, coffee: 'off', 'filing-1': 'closed' }))
                  const newTarget = { ...agent.deskPosition }
                  updated = {
                    ...agent,
                    position,
                    state: 'walking-to-desk',
                    targetPosition: newTarget,
                    statusText: workMessage(),
                    pathQueue: computePath(position, newTarget),
                  }
                  changed = true
                }
              }
            } else {
              if (
                Math.abs(position.x - agent.position.x) > 0.01 ||
                Math.abs(position.y - agent.position.y) > 0.01
              ) {
                updated = { ...agent, position }
                changed = true
              }
            }
          }
        } else {
          // Still walking
          if (
            Math.abs(position.x - agent.position.x) > 0.001 ||
            Math.abs(position.y - agent.position.y) > 0.001
          ) {
            updated = { ...agent, position }
            changed = true
          }
        }

        // Random break trigger
        if (
          updated.state === 'working'&&
          meta.arrivedAtDeskAt !== null &&
          !meta.onBreak &&
          COFFEE_SPOT !== null
        ) {
          const deskTime = nowMs - meta.arrivedAtDeskAt
          if (deskTime >= BREAK_MIN_DESK_TIME) {
            const breakRoll = BREAK_CHANCE_PER_SEC * (dt / 60)
            if (Math.random() < breakRoll) {
              const useWater = Math.random() < 0.35 && WATER_SPOTS.length > 0
              const breakSpot = useWater
                ? WATER_SPOTS[Math.floor(Math.random() * WATER_SPOTS.length)]
                : COFFEE_SPOT

              meta.onBreak = false
              meta.arrivedAtDeskAt = null

              const cfg = AGENT_CONFIGS[updated.role] ?? AGENT_CONFIGS['default' ]
              const isBoss = updated.id === BOSS_ID
              const breakMsg = useWater ? waterMessage() : (isBoss ? 'grabbing a Red Bull': coffeeMessage())
              addMsg(updated.name, updated.role, cfg.color, breakMsg)
              if (!sfx.isMuted()) sfx.playCoffee()

              const breakTarget = { x: breakSpot.x, y: breakSpot.y }
              updated = {
                ...updated,
                state: 'coffee-break',
                targetPosition: breakTarget,
                statusText: breakMsg,
                pathQueue: computePath(updated.position, breakTarget),
              }
              changed = true
            }
          }
        }

        return updated
      })

      // Prune completed agents at the door (never prune the boss)
      const pruneIds = new Set<string>()
      for (const a of next) {
        if (a.id === BOSS_ID || a.id === CLAUDE_ID) continue
        if (a.state === 'completed') {
          const atDoor = (
            Math.abs(a.position.x - DOOR_TARGET.x) < ARRIVAL_THRESHOLD * 2 &&
            Math.abs(a.position.y - DOOR_TARGET.y) < ARRIVAL_THRESHOLD * 2
          )
          if (atDoor) {
            agentMetaRef.current.delete(a.id)
            pruneIds.add(a.id)
          }
        }
      }

      if (changed || pruneIds.size > 0) {
        const moved = new Map(next.map(a => [a.id, a] as const))
        setAgents(cur => {
          const merged = cur.map(a => moved.get(a.id) ?? a)
          return merged.filter(a => !pruneIds.has(a.id))
        })
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------------
  // Random office events — fire every 60-120 seconds
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Percentage-based target positions for each event type (matching room layout)
    const EVENT_TARGETS: Record<string, { x: number; y: number }> = {
      'fire-drill': { x: 67.5, y: 48.9 },
      'pizza':      { x: 67.5, y: 48.9 },
      'standup':    { x: 28.9, y: 66.0 },
      'birthday':   { x: 73.5, y: 56.7 },
      'printer-jam': { x: 83.8, y: 63 },
    }

    const bossCfg = AGENT_CONFIGS[BOSS_ROLE] ?? AGENT_CONFIGS['default' ]

    function fireEvent() {
      const event = pickEvent()

      // Post main slack announcement (system message)
      addMsg('system', 'default', '#8b8d91', event.slackAnnouncement, true)

      // Play associated sound
      if (event.sound && !sfx.isMuted()) {
        switch (event.sound) {
          case 'alarm':        sfx.playAlarm(); break
          case 'celebration':  sfx.playCelebration(); break
          case 'doorOpen':     sfx.playDoorOpen(); break
          case 'error':        sfx.playError(); break
          case 'powerDown':    sfx.playPowerDown(); break
          case 'notification': sfx.playNotification(); break
          case 'coffee':       sfx.playCoffee(); break
        }
      }

      // Manager message from boss
      if (event.managerMessage) {
        setTimeout(() => {
          addMsg(bossCfg.title, BOSS_ROLE, bossCfg.color, event.managerMessage!)
        }, 500)
      }

      // Staggered agent messages as reactions
      const messages = event.agentMessages ?? []
      const currentAgents = agentsRef.current
      // Build list of participating agents (include boss)
      const participants = currentAgents.filter(a => a.id === BOSS_ID || a.state === 'working' || a.state === 'coffee-break')

      // Pick ONE random agent message (not a wall of spam)
      if (messages.length > 0) {
        const text = messages[Math.floor(Math.random() * messages.length)]
        setTimeout(() => {
          const nonBoss = participants.filter(a => a.id !== BOSS_ID)
          if (nonBoss.length === 0) return
          const agent = nonBoss[Math.floor(Math.random() * nonBoss.length)]
          const cfg = AGENT_CONFIGS[agent.role] ?? AGENT_CONFIGS['default' ]
          addMsg(agent.name, agent.role, cfg.color, text)
        }, 1200)
      }

      // Handle event types
      if (event.type === 'all-move') {
        const target = EVENT_TARGETS[event.id] ?? { x: 67.5, y: 48.9 }

        // Move all agents (including boss) to target
        setAgents(prev => prev.map(a => ({
          ...a,
          state: 'walking-to-desk' as const,
          targetPosition: { ...target },
          statusText: event.name,
          pathQueue: computePath(a.position, target),
        })))

        // After duration, send agents back to their desks
        setTimeout(() => {
          setAgents(prev => prev.map(a => ({
            ...a,
            state: 'walking-to-desk' as const,
            targetPosition: { ...a.deskPosition },
            statusText: 'back to work',
            pathQueue: computePath(a.position, a.deskPosition),
          })))
        }, event.duration)

      } else if (event.type === 'single-agent') {
        const target = EVENT_TARGETS[event.id] ?? { x: 83.8, y: 63 }
        // Pick a random non-boss working agent
        const workers = agentsRef.current.filter(a => a.id !== BOSS_ID && (a.state === 'working' || a.state === 'walking-to-desk'))
        if (workers.length > 0) {
          const chosen = workers[Math.floor(Math.random() * workers.length)]

          // Printer jam: break the printer when agent walks over
          if (event.id === 'printer-jam') {
            setFurnitureStates(prev => ({ ...prev, 'printer-1': 'broken' }))
          }

          setAgents(prev => prev.map(a => {
            if (a.id !== chosen.id) return a
            return {
              ...a,
              state: 'walking-to-desk' as const,
              targetPosition: { ...target },
              statusText: event.name,
              pathQueue: computePath(a.position, target),
            }
          }))
          // Return after duration, fix the printer
          setTimeout(() => {
            if (event.id === 'printer-jam') {
              setFurnitureStates(prev => ({ ...prev, 'printer-1': 'working' }))
            }
            setAgents(prev => prev.map(a => {
              if (a.id !== chosen.id) return a
              return {
                ...a,
                state: 'walking-to-desk' as const,
                targetPosition: { ...a.deskPosition },
                statusText: 'back to work',
                pathQueue: computePath(a.position, a.deskPosition),
              }
            }))
          }, event.duration)
        }

      } else if (event.type === 'visual-only') {
        // Power flicker: add CSS class for flicker animation
        setFlickering(true)
        setTimeout(() => setFlickering(false), event.duration)
      }
      // 'slack-only' events: messages already posted above — no movement
    }

    // Schedule first event after 60-120 seconds, then repeat
    function scheduleNext() {
      const delay = 60_000 + Math.random() * 60_000
      return setTimeout(() => {
        fireEvent()
        timerRef = scheduleNext()
      }, delay)
    }

    let timerRef = scheduleNext()
    return () => clearTimeout(timerRef)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addMsg])

  // ---------------------------------------------------------------------------
  // Ambient office sounds
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Start ambient hum (only if not muted)
    if (!sfx.isMuted()) {
      // Delay slightly to let AudioContext resume after first user interaction
      const startTimer = setTimeout(() => {
        sfx.playAmbientHum()
      }, 2000)
      return () => {
        clearTimeout(startTimer)
        sfx.stopAmbient()
      }
    }
    return () => sfx.stopAmbient()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keyboard clatter every 2-4 seconds when agents are working
  useEffect(() => {
    const interval = setInterval(() => {
      if (sfx.isMuted()) return
      const working = agentsRef.current.filter(a => a.state === 'working')
      if (working.length === 0) return
      sfx.playKeyboardClatter()
    }, 2000 + Math.random() * 2000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Stop/start ambient when mute changes
  useEffect(() => {
    if (muted) {
      sfx.stopAmbient()
    } else {
      sfx.playAmbientHum()
    }
  }, [muted])

  // ---------------------------------------------------------------------------
  // Misc handlers
  // ---------------------------------------------------------------------------

  // Effective day phase (respects manual override)
  const effectivePhase: DayPhase = dayNightMode === 'auto' ? dayPhase
    : dayNightMode === 'day' ? 'morning' :  'night'
  const isNight = effectivePhase === 'night' || effectivePhase === 'dusk'

  const [volume, setVolume] = useState(sfx.getVolume())

  const handleToggleMute = useCallback(() => {
    const nowMuted = sfx.toggleMute()
    setMuted(nowMuted)
    setVolume(sfx.getVolume())
  }, [])

  const handleVolumeChange = useCallback((v: number) => {
    sfx.setVolume(v)
    setVolume(v)
    setMuted(v === 0)
  }, [])

  // ---------------------------------------------------------------------------
  // Render — helper mode renders PlacementHelper in place of the full app
  // ---------------------------------------------------------------------------

  if (isHelperMode) {
    return (
      <Suspense fallback={<div style={{ color: '#666', padding: 20 }}>Loading helper...</div>}>
        <PlacementHelper />
      </Suspense>
    )
  }

  return (
    <div className="app-wrapper">
      <div className="title-bar">
        <div className="title-bar-dot" style={{ background: '#ff5f57' }} />
        <div className="title-bar-dot" style={{ background: '#febc2e' }} />
        <div className="title-bar-dot" style={{ background: '#28c840' }} />
        <span className="title-bar-text">URBAN TRIBBLE - RED TEAM OFFICE</span>
        <button
          className="title-bar-brief"
          onClick={() => setBriefOpen(true)}
          title="Ajukan brief baru"
        >
          <Icon name="doc" size={9} />
          <span>BRIEF</span>
        </button>
        <button
          className="title-bar-daynight"
          onClick={() => setDayNightMode(prev =>
            prev === 'auto' ? 'day': prev === 'day' ? 'night' :  'auto'
          )}
          title={`Mode: ${dayNightMode}`}
        >
          {dayNightMode === 'auto' ? 'AUTO': dayNightMode === 'day' ? 'DAY' :  'NIGHT' }
        </button>
        <span className="title-bar-phase">{getPhaseLabel(effectivePhase)}</span>
      </div>

      <div className="app-body">
      <div className="office-view">
        <div
          ref={roomRef}
          className={`room-container${flickering ? 'flickering' :  '' }`}
          style={{ '--scene-scale': sceneScale } as React.CSSProperties}
        >
          {/* Room backgrounds — both rendered, night crossfades via opacity. Theme swaps source art. */}
          <div
            key={`day-${theme}`}
            className="room-background"
            style={{ backgroundImage: `url(${getRoomImage('day')})`}}
          />
          <div
            key={`night-${theme}`}
            className="room-background room-background-night"
            style={{
              backgroundImage: `url(${getRoomImage('night')})`,
              opacity: dayNightMode === 'auto' ? nightOpacity : dayNightMode === 'night' ? 1 : 0,
            }}
          />

          {/* Furniture — apply interactive state overrides */}
          <FurnitureRenderer onItemClick={handleFurnitureClick} items={MAIN_ROOM.furniture.map(item => {
            const stateOverride = furnitureStates[item.id]
            if (!stateOverride) return item
            // Swap sprite based on state
            if (item.id === 'coffee' && stateOverride === 'on') {
              return { ...item, sprite: 'coffee-on' }
            }
            if (item.id === 'filing-1' && stateOverride === 'open') {
              return { ...item, sprite: 'filing-open' }
            }
            if (item.id === 'printer-1' && stateOverride === 'broken') {
              return { ...item, sprite: 'printer-broken' }
            }
            return item
          })} />

          {/* Agents */}
          {agents.map(agent => {
            // Use spot zIndex override when agent is at their desk
            const spot = MAIN_ROOM.agentSpots.find(s => s.id === agent.assignedSpotId)
            const atDesk = Math.abs(agent.position.x - agent.deskPosition.x) < 1 &&
                           Math.abs(agent.position.y - agent.deskPosition.y) < 1
            const zOverride = atDesk && spot?.zIndex ? spot.zIndex : undefined

            const meta = agentMetaRef.current.get(agent.id)
            const idleDurationMs =
              agent.state === 'idle' && meta?.idleSince
                ? Date.now() - meta.idleSince
                : 0

            return (
              <Character
                key={agent.id}
                agent={agent}
                idleDurationMs={idleDurationMs}
                zIndex={zOverride}
                isTyping={typingAgents.has(agent.id)}
              />
            )
          })}

          {/* Angela's cat — follows whoever is cast as Angela in Office theme */}
          {(() => {
            const angela = getAngelaCat()
            if (!angela) return null
            const host = agents.find(a => a.role === angela.role)
            if (!host) return null
            return (
              <img
                src={angela.catSprite}
                alt="cat"
                className="angela-cat"
                style={{
                  position: 'absolute',
                  left: `${host.position.x + 2.2}%`,
                  top: `${host.position.y}%`,
                  // Why: cats are 30-40% of ~78px character = ~24-30px tall
                  height: 28,
                  width: 'auto',
                  transform: 'translate(-50%, -10%)',
                  zIndex: Math.round(host.position.y) + 1,
                  pointerEvents: 'none',
                  filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))',
                }}
                draggable={false}
              />
            )
          })()}

          {/* Boss interaction effect */}
          {bossEffect && (() => {
            const boss = agents.find(a => a.id === BOSS_ID)
            if (!boss) return null
            return (
              <div
                className="boss-interaction-effect"
                style={{
                  position: 'absolute',
                  left: `${boss.position.x}%`,
                  top: `${boss.position.y - 8}%`,
                  transform: 'translate(-50%, -100%)',
                  zIndex: 999,
                  pointerEvents: 'none',
                }}
              >
                <img
                  src={bossEffect}
                  alt="interaction"
                  style={{ height: 32, width: 'auto', imageRendering: 'pixelated' }}
                />
              </div>
            )
          })()}

          {/* Day/night overlay */}
          <div className={`day-overlay ${effectivePhase}`} />
        </div>
      </div>

      <SlackChat
        messages={messages}
        muted={muted}
        volume={volume}
        onToggleMute={handleToggleMute}
        onVolumeChange={handleVolumeChange}
        onSendMessage={(text) => {
          const bossCfg = AGENT_CONFIGS[BOSS_ROLE] ?? AGENT_CONFIGS['default' ]
          addMsg(bossCfg.title, BOSS_ROLE, bossCfg.color, text)
          setAutoTypeText(undefined)
          // Send to server so Claude can read it
          fetch('http://127.0.0.1:3334/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender: bossCfg.title, text }),
          }).catch(() => {})
        }}
        autoTypeText={autoTypeText}
        dayPhase={effectivePhase}
        typingUser={chatTypingUser}
        lastSeenId={lastSeenId}
        onReaction={(messageId, reactions) => {
          setMessages(prev => prev.map(m =>
            m.id === messageId ? { ...m, reactions } : m
          ))
        }}
      />

      <BriefDrawer
        open={briefOpen}
        onClose={() => setBriefOpen(false)}
        onSent={(file) =>
          addMsg('system', 'default', '#8b8d91', `brief ${file} terkirim. Ketua Tim mulai membacanya.`, true)
        }
      />
      </div>
    </div>
  )
}

export default App
