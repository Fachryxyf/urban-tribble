import type { RoomId } from './rooms'

export type AgentState =
  | 'idle'
  | 'walking-to-manager'
  | 'talking-to-manager'
  | 'walking-to-desk'
  | 'working'
  | 'coffee-break'
  | 'completed'
  | 'new-hire'
  | 'changing-room'

export interface Position {
  x: number
  y: number
}

export interface Agent {
  id: string
  name: string
  type: 'subagent' | 'mcp'
  role: string
  state: AgentState
  position: Position
  targetPosition: Position
  deskPosition: Position
  room: RoomId              // ruang tempat staf berada sekarang
  assignedRoom: RoomId      // ruang tempat meja mereka berada
  assignedSpotId?: string   // spot meja yang ditugaskan
  task?: string
  statusText?: string
  spriteFacing?: 'front-left' | 'front-right' | 'rear-left' | 'rear-right'
  color: string
  icon: string
  hiredAt: number
  pathQueue?: { x: number; y: number }[]  // waypoint untuk berjalan
}

export interface OfficeEvent {
  type: 'agent_spawned' | 'agent_working' | 'agent_completed' | 'mcp_call' | 'mcp_done' | 'new_hire' | 'chat_message' | 'chat_typing' | 'chat_reaction' | 'chat_seen'
  agent?: Partial<Agent>
  agentId?: string
  status?: string
  result?: string
  sender?: string
  text?: string
}

import { BOSS_NAME, BOSS_COLOR, BOSS_ICON } from './config'

export const AGENT_CONFIGS: Record<string, { color: string; icon: string; title: string }> = {
  // Bos — dikonfigurasi via office.config.json
  'boss':                  { color: BOSS_COLOR, icon: BOSS_ICON, title: BOSS_NAME },
  // Tim Red Team — 6 role analis internal
  'ketua': { color: '#3498db', icon: 'clipboard', title: 'Ketua Tim' },
  'pengacara': { color: '#e74c3c', icon: 'bolt', title: 'Pengacara Bantah' },
  'risiko': { color: '#f39c12', icon: 'shield', title: 'Analis Risiko' },
  'fakta': { color: '#00bcd4', icon: 'search', title: 'Penyelidik Fakta' },
  'ekonom': { color: '#27ae60', icon: 'chart', title: 'Ekonom' },
  'penulis': { color: '#9b59b6', icon: 'doc', title: 'Penulis Memo' },
  'staff': { color: '#78909c', icon: 'archive', title: 'Staff' },
  // Asisten kantor (balasan chat AI)
  'assistant': { color: '#cc785c', icon: 'robot', title: 'Asisten' },
  'default': { color: '#95a5a6', icon: 'person', title: 'Staf' },
}
