/**
 * config.ts — konstanta konfigurasi bersama
 *
 * Membaca pengaturan bos dari office.config.json di root project.
 * Bos bisa kustom nama, sprite, dan warna di sana.
 */

// Muat config pengguna (office.config.json) — dibundel oleh Vite
let userConfig: { boss?: { name?: string; sprite?: string; color?: string; icon?: string } } = {}
try {
  // Vite menangani import JSON saat build
  // @ts-ignore office.config.json dibuat lokal dari office.config.example.json
  userConfig = await import('../office.config.json')
} catch {
  // Fallback kalau file tidak ada
}

const bossName   = userConfig.boss?.name   ?? 'Bos'
const bossSprite = userConfig.boss?.sprite ?? 'Me-1'
const bossColor  = userConfig.boss?.color  ?? '#ff4444'
const bossIcon = userConfig.boss?.icon ?? 'crown'

// Bos — selalu ada di kantor
export const BOSS_CHAR = bossSprite
export const BOSS_ROLE = 'boss'
export const BOSS_NAME = bossName
export const BOSS_COLOR = bossColor
export const BOSS_ICON = bossIcon

// Peta role → nama dasar sprite karakter (di /sprites/characters/)
export const ROLE_TO_CHAR: Record<string, string> = {
  'boss':                  bossSprite,
  'assistant':             'dev-2',
  'ketua':                 'Claude-1',
  'pengacara':             'security-audit-1',
  'risiko':                'dev-1',
  'fakta':                 'explore-1',
  'ekonom':                'employee-1',
  'penulis':               'Frontend-dev-1',
  'staff':                 'employee-3',
}
