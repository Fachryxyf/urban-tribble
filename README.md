# Urban Tribble Office

**Kantor virtual tim Red Team: 6 analis AI yang membongkar proposal sampai habis.**

Urban Tribble mengubah brief di folder kerja jadi kantor pixel. Brief masuk lewat
`workspace/briefs/`, lalu enam role (Ketua Tim, Pengacara Bantah, Analis Risiko,
Penyelidik Fakta, Ekonom, Penulis Memo) membedahnya jadi artifact markdown sampai
memo eksekutif satu halaman, sambil melapor di channel `#kantor-umum`.

Basis [Claude-Office](https://github.com/W17ant/Claude-Office): sprite, server
Express/WS, dan UI React dipertahankan. Event source diganti folder kerja lokal,
seluruh label dan persona dalam Bahasa Indonesia dengan gaya Formal-Sarkastik.

## Konsep

| Lama (Claude-Office) | Baru (Urban Tribble) |
| --- | --- |
| Event dari Claude Code hooks | Event dari **folder kerja lokal** (`watch_folder`) |
| Role coding: debugger, devops, DBA | Role Red Team: ketua, pengacara, risiko, fakta, ekonom, penulis |
| Balasan chat generik | Skill per role di `skills/roles/*.md` (gaya Formal-Sarkastik) |
| Hasil berhenti di chat | Artifact markdown di `workspace/artifacts/` + memo final |

## Tim & Kata Kunci

| Role | Artifact | Contoh pemicu chat |
| --- | --- | --- |
| Ketua Tim | `00_brief_breakdown.md` | brief, fokus, rangkum, putuskan, arahan |
| Pengacara Bantah | `01_counter_arguments.md` | asumsi, bantah, kontra, lemah, bias |
| Analis Risiko | `02_risk_matrix.md` | risiko, gagal, celah, bottleneck, regulasi |
| Penyelidik Fakta | `03_fact_audit.md` | angka, klaim, kontradiksi, sumber, akurasi |
| Ekonom | `04_financial_feasibility.md` | biaya, margin, runway, kelayakan, breakeven |
| Penulis Memo | `final/EXECUTIVE_MEMO_*.md` | memo, ringkas, final, sintesis, eksekutif |

Tanpa emoji di seluruh antarmuka dan balasan. Ikon memakai SVG
(`src/components/Icon.tsx`).

## Alur Kerja Brief

```
workspace/briefs/proposal.md
        │  (hooks/file-watcher.py mendeteksi, menjalankan pipeline)
        ▼
Ketua Tim          → workspace/artifacts/00_brief_breakdown.md
Pengacara Bantah   → 01_counter_arguments.md   ┐ gelombang 1
Penyelidik Fakta   → 03_fact_audit.md           ┘ paralel
Analis Risiko      → 02_risk_matrix.md          ┐ gelombang 2
Ekonom             → 04_financial_feasibility.md┘ paralel
Penulis Memo       → workspace/final/EXECUTIVE_MEMO_<NAMA>.md
```

Setiap tahap mengirim event kantor (`agent_spawned`, `agent_working`,
`agent_completed`) dan satu pesan chat ringkas ke `#kantor-umum`.

## Instalasi

```bash
git clone https://github.com/Fachryxyf/urban-tribble.git
cd urban-tribble
npm install
cp office.config.example.json office.config.json
```

Edit `office.config.json`:

```json
{
  "boss": { "name": "NamaAnda", "sprite": "Me-1" },
  "watch_folder": "/path/absolut/ke/repo/workspace",
  "poll_interval": 4
}
```

- `watch_folder` : folder kerja yang dipantau. Pakai folder `workspace/` di repo.
- `poll_interval` : interval cek dalam detik (default 4).

LLM API disimpan di `~/.agent-office/llm.json`
(`{"base_url", "model", "api_key", "max_tokens"}`, izin `600`, jangan di-commit).

## Menjalankan

```bash
npm run start        # server + UI + watcher chat AI + pipeline Red Team
# atau terpisah:
npm run server       # Express + WebSocket di port 3334
npm run dev          # Vite di port 3333
npm run file-watcher # watcher folder kerja
```

Buka http://localhost:3333, lalu taruh brief (`.md` atau `.pdf`) di
`workspace/briefs/`. Staf masuk kantor, bekerja, dan memo final muncul di
`workspace/final/`. Tekan `Ctrl+C` di terminal `start-office.sh`, atau jalankan
`npm run stop`.

## Perintah Chat

| Perintah | Fungsi | Alias lama |
| --- | --- | --- |
| `/laporan` | Ringkasan aktivitas kantor | `/status` |
| `/tim` | Daftar staf yang sedang bertugas | `/agents` |
| `/hapus` | Bersihkan chat | `/clear` |
| `/bantuan` | Bantuan perintah | `/help` |
| `/the-office` | Ganti tema kantor | tidak ada |

Tombol **AI Mati/Hidup** di header chat menunda/melanjutkan balasan AI.

## Arsitektur Event

```
workspace/briefs ──(hooks/file-watcher.py)──▶ scripts/redteam-pipeline.py
    brief baru → Ketua Tim → 4 analis → Penulis Memo → memo final

chat #kantor-umum ──(scripts/chat-ai-watcher.sh)──▶ LLM API
    kata kunci → routing role → balasan bergaya Formal-Sarkastik
```

## Struktur

```
urban-tribble/
├── office.config.example.json   # konfigurasi (boss, watch_folder)
├── skills/roles/                # skill per role + gaya global
│   ├── global.md
│   └── ketua.md ... penulis.md
├── workspace/                   # brief & hasil kerja (tidak di-commit)
│   ├── briefs/  artifacts/  final/
├── hooks/
│   ├── file-watcher.py          # watcher folder kerja (event utama)
│   └── agent-tracker.sh         # opsional: event dari Claude Code
├── scripts/
│   ├── start-office.sh          # start semua layanan
│   ├── stop-office.sh           # stop semua layanan
│   ├── redteam-pipeline.py      # direktur pipeline brief → memo
│   ├── chat-ai-watcher.sh       # balas chat sebagai role Red Team
│   ├── llm-reply.py             # pemanggil LLM API
│   └── gather-context.sh        # konteks folder kerja untuk prompt
├── server/index.js              # Express + WebSocket (port 3334)
└── src/                         # UI React (port 3333)
```

## Keamanan

- Token auth disimpan di `~/.agent-office/auth-token` (izin `0600`) dan
  `/tmp/agent-office-token`.
- Server hanya mendengarkan `127.0.0.1`.
- Folder di luar `watch_folder` tidak pernah dibaca.
- Isi brief dan artifact tidak ikut ter-commit (ada di `.gitignore`).

## Lisensi

MIT. Berbasis [Claude-Office](https://github.com/W17ant/Claude-Office) (MIT).
