#!/usr/bin/env bash
# =============================================================================
# gather-context.sh — Kumpulkan konteks kantor untuk memperkaya prompt chat AI
# Membaca folder kerja (watch_folder) + daftar staf yang sedang bertugas
# =============================================================================
SERVER="http://127.0.0.1:3334"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Konteks kantor saat ini:"

# Folder kerja dari office.config.json
WATCH_DIR=$(python3 -c "
import json, os, sys
p = os.path.join('$PROJECT_DIR', 'office.config.json')
try:
    cfg = json.load(open(p))
    print(cfg.get('watch_folder', ''))
except Exception:
    sys.exit(0)
" 2>/dev/null)

if [ -n "$WATCH_DIR" ] && [ -d "$WATCH_DIR" ]; then
    echo "- Folder kerja: $WATCH_DIR"
    FILES=$(ls -1 "$WATCH_DIR" 2>/dev/null | head -8 | sed 's/^/- Berkas: /')
    [ -n "$FILES" ] && echo "$FILES"
else
    echo "- Folder kerja belum diatur (isi watch_folder di office.config.json)"
fi

# Staf yang sedang bertugas
AGENTS=$(curl -sf "$SERVER/roster" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
agents=d.get('activeAgents',[])
if agents:
    for a in agents[:5]:
        print(f\"- Staf: {a.get('name','?')} ({a.get('role','?')}) — {a.get('task','')[:40]}\")
else:
    print('- Tidak ada staf yang sedang bertugas')
" 2>/dev/null)
echo "$AGENTS"
