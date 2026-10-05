#!/usr/bin/env bash
# =============================================================================
# start-office.sh — Start Urban Tribble Office (server + UI + folder watcher)
#
# If the packaged Electron app exists (release/mac/Urban Tribble Office.app or the
# --dir output at release/mac-unpacked/Urban Tribble Office.app), launch it directly —
# the app manages the server internally.
#
# Otherwise fall back to the dev workflow: start the Express server and Vite
# separately (same behaviour as before).
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

cd "$PROJECT_DIR"

# ---------------------------------------------------------------------------
# Check for a packaged Electron build
# Electron-builder places the .app at:
#   release/<mac|mac-arm64>/Urban Tribble Office.app        (DMG build)
#   release/mac-unpacked/Urban Tribble Office.app           (--dir / pack build)
# ---------------------------------------------------------------------------

ELECTRON_APP=""

for candidate in \
    "release/mac/Urban Tribble Office.app" \
    "release/mac-arm64/Urban Tribble Office.app" \
    "release/mac-unpacked/Urban Tribble Office.app"
do
    if [ -d "$PROJECT_DIR/$candidate" ]; then
        ELECTRON_APP="$PROJECT_DIR/$candidate"
        break
    fi
done

if [ -n "$ELECTRON_APP" ]; then
    echo -e "${GREEN}[ok]${RESET} Found packaged app: $ELECTRON_APP"
    echo -e "${CYAN}[...]${RESET} Meluncurkan Urban Tribble Office..."
    open "$ELECTRON_APP"
    echo ""
    echo -e "${GREEN}Urban Tribble Office diluncurkan!${RESET}"
    echo "  Aplikasi mengelola server secara internal."
    echo "  Lihat /tmp/agent-office-token untuk token autentikasi."
    exit 0
fi

# ---------------------------------------------------------------------------
# Dev fallback — separate server + Vite
# ---------------------------------------------------------------------------

echo -e "${CYAN}[info]${RESET} App belum di-build — mode dev"
echo -e "       (Jalankan 'npm run pack' untuk build app Electron)"
echo ""

# Check if server is already running
if curl -sf http://127.0.0.1:3334/health > /dev/null 2>&1; then
    echo -e "${GREEN}[ok]${RESET} Server already running on port 3334"
else
    echo -e "${CYAN}[...]${RESET} Menjalankan server WebSocket..."
    node server/index.js &
    SERVER_PID=$!
    # Wait for server to be ready
    for i in {1..10}; do
        if curl -sf http://127.0.0.1:3334/health > /dev/null 2>&1; then
            echo -e "${GREEN}[ok]${RESET} Server siap (PID: $SERVER_PID)"
            break
        fi
        sleep 0.5
    done
fi

# Check if Vite is already running
if curl -sf http://localhost:3333 > /dev/null 2>&1; then
    echo -e "${GREEN}[ok]${RESET} Vite already running on port 3333"
else
    echo -e "${CYAN}[...]${RESET} Menjalankan Vite dev server..."
    npx vite --port 3333 &
    VITE_PID=$!
    # Wait for Vite to be ready
    for i in {1..15}; do
        if curl -sf http://localhost:3333 > /dev/null 2>&1; then
            echo -e "${GREEN}[ok]${RESET} Vite siap (PID: $VITE_PID)"
            break
        fi
        sleep 0.5
    done
fi

# Start chat AI watcher in background (kill any stale ones first)
WATCHER_PID_FILE="$HOME/.agent-office/chat-watcher.pid"
# Kill any leftover watcher processes
pkill -f "chat-ai-watcher.sh" 2>/dev/null || true
pkill -f "chat-watcher.sh" 2>/dev/null || true
rm -f "$WATCHER_PID_FILE"
    echo -e "${CYAN}[...]${RESET} Menjalankan watcher chat AI..."
    bash "$PROJECT_DIR/scripts/chat-ai-watcher.sh" >> /tmp/agent-office-chat-ai.log 2>&1 &
    sleep 0.5
    if [ -f "$WATCHER_PID_FILE" ]; then
        echo -e "${GREEN}[ok]${RESET} Watcher chat AI siap (PID: $(cat "$WATCHER_PID_FILE"))"
    else
        echo -e "${YELLOW}[warn]${RESET} Watcher chat AI mungkin gagal mulai"
    fi

# Start pipeline Red Team (brief -> 00..04 -> memo final)
pkill -f "redteam-pipeline.py" 2>/dev/null || true
rm -f "$HOME/.agent-office/pipeline.lock"
if [ -d "$PROJECT_DIR/workspace/briefs" ]; then
    echo -e "${CYAN}[...]${RESET} Menjalankan pipeline Red Team..."
    python3 -u "$PROJECT_DIR/scripts/redteam-pipeline.py" --loop >> /tmp/urban-tribble-pipeline.log 2>&1 &
    sleep 0.5
    echo -e "${GREEN}[ok]${RESET} Pipeline Red Team aktif (folder workspace/briefs)"
fi

# Start folder watcher (event source: folder kerja lokal)
pkill -f "file-watcher.py" 2>/dev/null || true
WATCH_CFG=$(python3 -c "
import json, os
try:
    c=json.load(open('$PROJECT_DIR/office.config.json'))
    print(c.get('watch_folder',''))
except Exception:
    print('')")
if [ -n "$WATCH_CFG" ] && [ -d "$WATCH_CFG" ]; then
    echo -e "${CYAN}[...]${RESET} Menjalankan watcher folder kerja: $WATCH_CFG"
    python3 -u "$PROJECT_DIR/hooks/file-watcher.py" --loop >> /tmp/urban-tribble-file-watcher.log 2>&1 &
    sleep 0.5
    echo -e "${GREEN}[ok]${RESET} Folder watcher aktif"
else
    echo -e "${YELLOW}[warn]${RESET} watch_folder belum diatur — salin office.config.example.json ke office.config.json"
fi

# Buka di browser
echo -e "${CYAN}[...]${RESET} Membuka Urban Tribble Office..."
open http://localhost:3333

echo ""
echo -e "${GREEN}Urban Tribble Office berjalan!${RESET}"
echo "  Kantor:  http://localhost:3333"
echo "  Server:  http://localhost:3334"
echo "  Chat AI: aktif/nonaktif dari UI"
echo "  Brief  : taruh berkas .md/.pdf di workspace/briefs/"
echo ""
echo "Tekan Ctrl+C untuk menghentikan semua layanan"

# Wait for background processes
wait
