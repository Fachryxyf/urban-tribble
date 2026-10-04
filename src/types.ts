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
  // Divisi kantor
  'keuangan': { color: '#27ae60', icon: 'wallet', title: 'Keuangan' },
  'hrd': { color: '#8e44ad', icon: 'users', title: 'HRD' },
  'admin': { color: '#2980b9', icon: 'folder', title: 'Admin' },
  'sekretaris': { color: '#e91e63', icon: 'calendar', title: 'Sekretaris' },
  'logistik': { color: '#e67e22', icon: 'box', title: 'Logistik' },
  'pemasaran': { color: '#1abc9c', icon: 'megaphone', title: 'Pemasaran' },
  'staff': { color: '#78909c', icon: 'archive', title: 'Staff' },
  // Asisten kantor (balasan chat AI)
  'assistant': { color: '#cc785c', icon: 'robot', title: 'Asisten' },
  'default': { color: '#95a5a6', icon: 'person', title: 'Staf' },
}
