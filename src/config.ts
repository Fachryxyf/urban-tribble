/**
 * config.ts — konstanta konfigurasi bersama
 *
 * Membaca pengaturan bos dari office.config.json di root project.
 * Bos bisa kustom nama, sprite, dan warna di sana.
 */

// Muat config pengguna (office.config.json) — dibundel oleh Vite
let userConfig: { boss?: { name?: string; sprite?: string; color?: string; emoji?: string } } = {}
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
const bossEmoji  = userConfig.boss?.emoji  ?? '👑'

// Bos — selalu ada di kantor
export const BOSS_CHAR = bossSprite
export const BOSS_ROLE = 'boss'
export const BOSS_NAME = bossName
export const BOSS_COLOR = bossColor
export const BOSS_EMOJI = bossEmoji

// Peta role → nama dasar sprite karakter (di /sprites/characters/)
export const ROLE_TO_CHAR: Record<string, string> = {
  'boss':                  bossSprite,
  'assistant':             'Claude-1',
  'keuangan':              'employee-1',
  'hrd':                   'employee-2',
  'admin':                 'employee-3',
  'sekretaris':            'Frontend-dev-1',
  'logistik':              'dev-1',
  'pemasaran':             'dev-2',
  'staff':                 'explore-1',
}
