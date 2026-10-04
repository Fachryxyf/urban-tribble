#!/usr/bin/env bash
# =============================================================================
# chat-ai-watcher.sh — Pantau chat kantor & balas sebagai Asisten AI
# Di-start oleh start-office.sh, dihentikan oleh stop-office.sh
#
# Routing pesan ke divisi berdasarkan kata kunci:
#   Keuangan, HRD, Admin, Sekretaris, Logistik, Pemasaran
# =============================================================================

set -u

SERVER="http://127.0.0.1:3334"
POLL_INTERVAL=8
PID_FILE="$HOME/.agent-office/chat-watcher.pid"
STATE_DIR="$HOME/.agent-office"
LAST_TS_FILE="$STATE_DIR/chat-ai-last-ts"
LOCK_FILE="$STATE_DIR/chat-ai.lock"

mkdir -p "$STATE_DIR"
echo $$ > "$PID_FILE"

if [ -f "$LAST_TS_FILE" ]; then
    LAST_TS=$(cat "$LAST_TS_FILE")
else
    LAST_TS=$(date +%s)000
    echo "$LAST_TS" > "$LAST_TS_FILE"
fi

echo "[chat-ai] Started (pid $$), polling every ${POLL_INTERVAL}s"

cleanup() { rm -f "$PID_FILE" "$LOCK_FILE"; echo "[chat-ai] Stopped"; exit 0; }
trap cleanup EXIT INT TERM

while true; do
    sleep "$POLL_INTERVAL"

    curl -sf "$SERVER/health" > /dev/null 2>&1 || continue

    IS_PAUSED=$(curl -sf "$SERVER/chat/cron-state" 2>/dev/null | python3 -c "import sys,json; print('true' if json.load(sys.stdin).get('paused') else 'false')" 2>/dev/null || echo "true")
    [ "$IS_PAUSED" = "true" ] && continue

    RESPONSE=$(curl -sf "$SERVER/chat?since=$LAST_TS" 2>/dev/null || echo '{"messages":[]}')

    # Hanya pesan manusia (bukan staf divisi/Asisten/sistem) — cegah loop balasan
    RESULT=$(echo "$RESPONSE" | python3 -c "
import sys, json
AI_SENDERS = ('claude','asisten','assistant','system','keuangan','hrd','admin',
              'sekretaris','logistik','pemasaran','staff')
data = json.load(sys.stdin)
msgs = data.get('messages', [])
user_msgs = [m for m in msgs if m.get('sender','').lower() not in AI_SENDERS
             and not m.get('text','').lower().startswith(\"there's an issue\")]
if user_msgs:
    last = user_msgs[-1]
    print(last.get('text', ''))
else:
    print('')
if msgs:
    print(msgs[-1]['timestamp'], file=sys.stderr)
" 2>"$STATE_DIR/chat-ai-ts-tmp")

    NEW_TS=$(cat "$STATE_DIR/chat-ai-ts-tmp" 2>/dev/null | head -1)
    rm -f "$STATE_DIR/chat-ai-ts-tmp"
    if [ -n "$NEW_TS" ]; then
        LAST_TS="$NEW_TS"
        echo "$LAST_TS" > "$LAST_TS_FILE"
    fi

    [ -z "$RESULT" ] && continue

    if [ -f "$LOCK_FILE" ]; then
        echo "[chat-ai] Lewati — masih membalas pesan lain"
        continue
    fi

    echo "[chat-ai] Pesan baru: $RESULT"
    touch "$LOCK_FILE"

    # Routing kata kunci → divisi kantor
    AGENT_INFO=$(echo "$RESULT" | python3 -c "
import sys
msg = sys.stdin.read().lower()
routes = [
    (['invoice','laporan','anggaran','pengeluaran','pemasukan','pajak','rekap','gaji','biaya','transfer','neraca','kas','bayar','faktur','ppn'], 'keuangan', 'Keuangan'),
    (['absensi','karyawan','cuti','rekrut','interview','wawancara','kontrak','shift','slip','hrd','pegawai','onboarding','lembur','karyawan baru'], 'hrd', 'HRD'),
    (['surat','arsip','dokumen','formulir','stempel','ekspedisi','file','folder','scan','digitalisasi','kopi','berkas'], 'admin', 'Admin'),
    (['jadwal','rapat','meeting','kalender','agenda','undangan','janji','appointment','reminder','reservasi'], 'sekretaris', 'Sekretaris'),
    (['stok','gudang','kirim','kiriman','supplier','pengiriman','inventory','paket','kurir','barang','persediaan','delivery'], 'logistik', 'Logistik'),
    (['kampanye','iklan','konten','sosmed','promo','leads','klien','brand','marketing','pemasaran','event','diskon','followers'], 'pemasaran', 'Pemasaran'),
]
for keywords, role, name in routes:
    if any(w in msg for w in keywords):
        print(f'{role}|{name}')
        sys.exit(0)
print('assistant|Asisten')
")
    AGENT_ROLE=$(echo "$AGENT_INFO" | cut -d'|' -f1)
    AGENT_NAME=$(echo "$AGENT_INFO" | cut -d'|' -f2)

    echo "[chat-ai] Dialihkan ke: $AGENT_NAME ($AGENT_ROLE)"
    echo "[chat-ai] Menyusun balasan..."

    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    OFFICE_CONTEXT=$(bash "$SCRIPT_DIR/gather-context.sh" 2>/dev/null || echo "")

    # Aturan anti-slop (skills/antislop-copywriting) — dipakai supaya balasan tidak terasa AI-generated
    SLOP_RULES="Gaya bahaya anti-AI-slop (WAJIB):
- Tanpa emoji sama sekali. Pakai kata biasa.
- Jangan mulai dengan 'Tentu', 'Baik', 'Pasti', 'Senang membantu'.
- Jangan pakai klise: 'hal yang tepat', 'penting untuk dicatat', 'jangan ragu', 'semoga membantu', 'kesimpulannya'.
- Langsung ke isi, kalimat pendek, nada manusia kantor Indonesia (santai, to the point).
- Maksimal 15 kata, satu kalimat kalau bisa."

    PERSONA=""
    if [ -f "$HOME/.agent-office/claude-persona.md" ]; then
        PERSONA=$(cat "$HOME/.agent-office/claude-persona.md")
    fi

    CONTEXT=$(curl -sf "$SERVER/chat" 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
msgs = data.get('messages', [])[-10:]
for m in msgs:
    print(f\"{m.get('sender','?')}: {m.get('text','')}\")
" 2>/dev/null)

    PROMPT="$PERSONA

$SLOP_RULES

Kamu merespons sebagai $AGENT_NAME, staf divisi $AGENT_ROLE di kantor Urban Tribble. Tetap dalam karakter, balas dalam Bahasa Indonesia.

$OFFICE_CONTEXT

Percakapan terakhir:
$CONTEXT

Balas pesan terbaru secara natural. Singkat (8-12 kata). Sambungkan dengan percakapan sebelumnya bila relevan."

    REPLY=$(printf '%s' "$PROMPT" | python3 "$SCRIPT_DIR/llm-reply.py" 2>/dev/null | tr '\n' ' ' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

    [ -z "$REPLY" ] && { echo "[chat-ai] Balasan kosong, dilewati"; rm -f "$LOCK_FILE"; continue; }

    REPLY=$(echo "$REPLY" | python3 -c "import sys; w=sys.stdin.read().strip().split(); print(' '.join(w[:15]))")

    # Jangan posting pesan error CLI sebagai balasan staf
    case "$REPLY" in
        *"There's an issue"*|*"command not found"*|*"is not"*)
            echo "[chat-ai] Balasan error CLI, dilewati: $REPLY"
            rm -f "$LOCK_FILE"
            continue
            ;;
    esac

    echo "[chat-ai] Balas sebagai $AGENT_NAME: $REPLY"

    CHAT_REPLY="$REPLY" CHAT_ROLE="$AGENT_ROLE" CHAT_SENDER="$AGENT_NAME" python3 -c "
import urllib.request, json, os
data = json.dumps({
    'sender': os.environ.get('CHAT_SENDER', 'Asisten'),
    'role': os.environ.get('CHAT_ROLE', 'assistant'),
    'text': os.environ.get('CHAT_REPLY', '')
}).encode()
req = urllib.request.Request('http://127.0.0.1:3334/chat/reply', data=data,
    headers={'Content-Type': 'application/json'}, method='POST')
try: urllib.request.urlopen(req, timeout=5)
except: pass
" 2>/dev/null

    rm -f "$LOCK_FILE"
    echo "[chat-ai] Selesai"
done
