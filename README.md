# Urban Tribble Office

**Virtual Office Staf AI untuk kantor biasa** — bukan untuk programmer.

Urban Tribble mengubah folder kerja kantor Anda menjadi kantor pixel: setiap divisi
(Keuangan, HRD, Admin, Sekretaris, Logistik, Pemasaran) dihuni staf AI yang
"masuk kantor", mengerjakan berkas, lalu melapor di channel `#kantor-umum`.

Dibangun di atas [Claude-Office](https://github.com/W17ant/Claude-Office) —
sprite, server Express/WS, dan UI React dipertahankan; event source diganti
menjadi **folder kerja lokal** (pengganti Claude Code hooks), seluruh label dan
persona dalam Bahasa Indonesia.

## Konsep

| Lama (Claude-Office) | Baru (Urban Tribble) |
| --- | --- |
| Event dari Claude Code hooks | Event dari **folder kerja lokal** (`watch_folder`) |
| Role coding: debugger, devops, DBA | Role divisi: keuangan, hrd, admin, sekretaris, logistik, pemasaran |
| Bahasa Inggris | **Bahasa Indonesia** sepenuhnya |
| Channel `#office-general` | Channel `#kantor-umum` |

## Divisi & Kata Kunci

| Divisi | Emoji | Contoh pemicu |
| --- | --- | --- |
| Keuangan | 💰 | invoice, laporan, anggaran, pajak, rekap gaji |
| HRD | 👥 | absensi, cuti, rekrut, kontrak, shift |
| Admin | 📁 | surat, arsip, dokumen, formulir, stempel |
| Sekretaris | 📅 | jadwal, rapat, agenda, undangan, kalender |
| Logistik | 📦 | stok, gudang, kiriman, supplier, pengiriman |
| Pemasaran | 📣 | kampanye, iklan, konten, promo, sosmed |
| Staff | 🗂 | fallback umum |

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
  "watch_folder": "/Users/Anda/Documents/FolderKantor",
  "poll_interval": 4
}
```

- `watch_folder` — folder kerja yang dipantau (berkas baru/berubah memicu staf).
- `poll_interval` — interval cek dalam detik (default 4).

## Menjalankan

```bash
npm run start        # server + UI + watcher chat AI + watcher folder
# atau terpisah:
npm run server       # Express + WebSocket di port 3334
npm run dev          # Vite di port 3333
npm run file-watcher # watcher folder kerja
```

Buka http://localhost:3333 — staf akan masuk kantor secara otomatis.
Tekan `Ctrl+C` di terminal `start-office.sh`, atau jalankan `npm run stop`.

## Perintah Chat

| Perintah | Fungsi | Alias lama |
| --- | --- | --- |
| `/laporan` | Ringkasan aktivitas kantor | `/status` |
| `/tim` | Daftar staf yang sedang bertugas | `/agents` |
| `/hapus` | Bersihkan chat | `/clear` |
| `/bantuan` | Bantuan perintah | `/help` |
| `/the-office` | Ganti tema kantor | — |

Tombol **AI Mati/Hidup** di header chat menunda/melanjutkan balasan AI.

## Arsitektur Event

```
folder kerja lokal ──(hooks/file-watcher.py)──▶ POST /event
   agent_spawned   → staf masuk & berjalan ke meja
   agent_working   → status pengerjaan
   agent_completed → hasil dilaporkan ke #kantor-umum

chat #kantor-umum ──(scripts/chat-ai-watcher.sh)──▶ claude -p
   keyword → routing divisi → balasan sebagai divisi terkait
```

## Struktur

```
urban-tribble/
├── office.config.example.json   # konfigurasi (boss, watch_folder)
├── hooks/
│   ├── file-watcher.py          # watcher folder kerja (event utama)
│   └── agent-tracker.sh         # opsional: event dari Claude Code
├── scripts/
│   ├── start-office.sh          # start semua layanan
│   ├── stop-office.sh           # stop semua layanan
│   ├── chat-ai-watcher.sh       # balas chat sebagai divisi
│   └── gather-context.sh        # konteks folder kerja untuk prompt
├── server/index.js              # Express + WebSocket (port 3334)
└── src/                         # UI React (port 3333)
```

## Keamanan

- Token auth disimpan di `~/.agent-office/auth-token` (izin `0600`) dan
  `/tmp/agent-office-token`.
- Server hanya mendengarkan `127.0.0.1`.
- Folder di luar `watch_folder` tidak pernah dibaca.

## Lisensi

MIT. Berbasis [Claude-Office](https://github.com/W17ant/Claude-Office) (MIT).
