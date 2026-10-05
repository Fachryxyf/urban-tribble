#!/usr/bin/env python3
"""
file-watcher.py — Pantau folder kerja lokal & kirim event ke Urban Tribble Office.

Pengganti hooks/agent-tracker.sh (Claude Code hooks) — sumber event kini
folder kerja biasa kantor (office.config.json -> watch_folder).

Setiap berkas baru/berubah memicu event:
    agent_spawned  -> staf masuk & mulai memproses berkas
    agent_working  -> status pengerjaan
    agent_completed-> hasil dikirim ke chat

Usage:
    python3 hooks/file-watcher.py            # polling sekali (cron-friendly)
    python3 hooks/file-watcher.py --loop     # polling terus-menerus
"""

import json
import os
import subprocess
import sys
import time
import urllib.request
from threading import Timer

SERVER = os.environ.get("OFFICE_SERVER", "http://127.0.0.1:3334/event")
PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CONFIG_FILE = os.path.join(PROJECT_DIR, "office.config.json")
STATE_DIR = os.path.join(os.path.expanduser("~"), ".agent-office")
AUTH_TOKEN_FILE = os.path.join(STATE_DIR, "auth-token")
STATE_FILE = os.path.join(STATE_DIR, "file-watcher-state.json")
PID_FILE = os.path.join(STATE_DIR, "file-watcher.pid")

IGNORE_EXT = {".tmp", ".swp", ".DS_Store", ".lock", ".partial", ".crdownload"}

# Kata kunci nama berkas -> role Red Team
DIVISI_RULES = [
    (["brief", "ringkas", "arahan", "putuskan", "fokus"], "ketua", "Ketua Tim"),
    (["bantah", "asumsi", "kontra", "counter", "kritik"], "pengacara", "Pengacara Bantah"),
    (["risiko", "celah", "risk", "vulnerability", "ancaman"], "risiko", "Analis Risiko"),
    (["audit", "fact", "klaim", "verifikasi", "sumber"], "fakta", "Penyelidik Fakta"),
    (["biaya", "margin", "finance", "ekonomi", "runway", "break"], "ekonom", "Ekonom"),
    (["memo", "final", "executive", "sintesis"], "penulis", "Penulis Memo"),
]
EXT_RULES = [
    (".xlsx", "ekonom", "Ekonom"),
    (".xls", "ekonom", "Ekonom"),
    (".csv", "ekonom", "Ekonom"),
    (".pdf", "ketua", "Ketua Tim"),
    (".doc", "ketua", "Ketua Tim"),
    (".docx", "ketua", "Ketua Tim"),
]

PIPELINE = os.path.join(PROJECT_DIR, "scripts", "redteam-pipeline.py")
BRIEF_EXTS = {".md", ".txt", ".pdf", ".doc", ".docx"}
# Output pipeline tidak boleh memicu watcher ulang (anti loop)
SKIP_DIRS = {"artifacts", "final", "node_modules", "__pycache__"}


WATCH_FOLDER = ""


def load_config():
    try:
        with open(CONFIG_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def route_file(path):
    name = os.path.basename(path).lower()
    stem, ext = os.path.splitext(name)
    for keys, role, title in DIVISI_RULES:
        if any(k in stem for k in keys):
            return role, title
    for e, role, title in EXT_RULES:
        if ext == e:
            return role, title
    return "staff", "Staff"


def auth_headers():
    try:
        with open(AUTH_TOKEN_FILE, encoding="utf-8") as f:
            token = f.read().strip()
        if token:
            return {"Authorization": f"Bearer {token}"}
    except OSError:
        pass
    return {}


def send_event(payload):
    data = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    headers.update(auth_headers())
    req = urllib.request.Request(SERVER, data=data, headers=headers, method="POST")
    try:
        urllib.request.urlopen(req, timeout=3)
        return True
    except Exception:
        return False


def is_brief(path):
    rel = os.path.relpath(path, WATCH_FOLDER).replace(os.sep, "/")
    stem, ext = os.path.splitext(os.path.basename(path))
    if stem.upper().startswith("TEMPLAT"):
        return False
    return rel.startswith("briefs/") and ext.lower() in BRIEF_EXTS


def launch_pipeline(path):
    # Pipeline loop sudah jalan? biar dia yang menangani (hindari proses ganda)
    try:
        probe = subprocess.run(["pgrep", "-f", "redteam-pipeline.py --loop"],
                               capture_output=True)
        if probe.returncode == 0:
            print("[file-watcher] pipeline loop aktif, brief ditangani oleh loop")
            return True
    except Exception:
        pass
    try:
        subprocess.Popen(
            [sys.executable, PIPELINE, path],
            stdout=open("/tmp/urban-tribble-pipeline.log", "a"),
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        return True
    except Exception as e:
        print(f"[file-watcher] gagal jalankan pipeline: {e}", file=sys.stderr)
        return False


def snapshot(folder):
    result = {}
    for root, dirs, files in os.walk(folder):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in SKIP_DIRS]
        for fn in files:
            if fn.startswith(".") or os.path.splitext(fn)[1].lower() in IGNORE_EXT:
                continue
            p = os.path.join(root, fn)
            try:
                st = os.stat(p)
            except OSError:
                continue
            result[p] = (st.st_mtime, st.st_size)
    return result


def process_change(path, prev_state):
    role, title = route_file(path)
    fname = os.path.basename(path)
    agent_id = f"file-{abs(hash(path)) % 10**8:x}"

    # Berkas brief -> pipeline Red Team yang mengerjakan semuanya
    if is_brief(path) and path not in prev_state:
        if launch_pipeline(path):
            print(f"[file-watcher] brief masuk, pipeline dijalankan: {fname}")
            return

    changed = path in prev_state
    verb = "Memperbarui" if changed else "Memproses"
    task = f"{verb} berkas {fname}"

    send_event({"type": "agent_spawned", "agent": {"id": agent_id, "name": title, "role": role, "task": task}})
    time.sleep(1.2)
    send_event({"type": "agent_working", "status": f"{title}: {task}"})
    time.sleep(1.8)

    result = f"{fname} selesai diproses divisi {title}"
    send_event({"type": "agent_completed", "agentId": agent_id, "result": result[:120]})


def run_once(loop=False):
    global WATCH_FOLDER
    cfg = load_config()
    folder = cfg.get("watch_folder", "")
    WATCH_FOLDER = folder
    interval = float(cfg.get("poll_interval", 4))

    if not folder or not os.path.isdir(folder):
        print(f"[file-watcher] watch_folder belum diatur/tidak ada: {folder!r}", file=sys.stderr)
        return

    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(PID_FILE, "w") as f:
            f.write(str(os.getpid()))
    except OSError:
        pass

    prev = {}
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            prev = json.load(f)
    except Exception:
        prev = {}

    cur = snapshot(folder)

    # Berkas baru / berubah
    changes = [p for p, v in cur.items() if prev.get(p) != v]
    if changes:
        print(f"[file-watcher] {len(changes)} perubahan di {folder}")

    # Proses maks 3 per siklus supaya tidak membanjiri kantor
    for path in changes[:3]:
        prev_state = {p: prev[p] for p in prev if p == path}
        try:
            process_change(path, prev_state)
        except Exception as e:
            print(f"[file-watcher] gagal {path}: {e}", file=sys.stderr)

    # Simpan snapshot (perubahan yang diproses maupun tidak)
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(cur, f)
    except OSError:
        pass

    if loop:
        Timer(interval, run_once, kwargs={"loop": True}).start()


def main():
    global WATCH_FOLDER
    loop = "--loop" in sys.argv
    if loop:
        # Blocking loop (tanpa Timer) supaya mudah dihentikan dengan kill
        cfg = load_config()
        folder = cfg.get("watch_folder", "")
        WATCH_FOLDER = folder
        interval = float(cfg.get("poll_interval", 4))
        if not folder or not os.path.isdir(folder):
            print(f"[file-watcher] watch_folder belum diatur/tidak ada: {folder!r}", file=sys.stderr)
            return 1
        try:
            os.makedirs(STATE_DIR, exist_ok=True)
            with open(PID_FILE, "w") as f:
                f.write(str(os.getpid()))
        except OSError:
            pass
        prev = {}
        try:
            with open(STATE_FILE, encoding="utf-8") as f:
                prev = json.load(f)
        except Exception:
            prev = {}
        print(f"[file-watcher] memantau {folder} setiap {interval}s (pid {os.getpid()})")
        while True:
            cur = snapshot(folder)
            changes = [p for p, v in cur.items() if prev.get(p) != v]
            for path in changes[:3]:
                prev_state = {p: prev[p] for p in prev if p == path}
                try:
                    process_change(path, prev_state)
                except Exception as e:
                    print(f"[file-watcher] gagal {path}: {e}", file=sys.stderr)
            prev = cur
            try:
                with open(STATE_FILE, "w", encoding="utf-8") as f:
                    json.dump(cur, f)
            except OSError:
                pass
            time.sleep(interval)
    else:
        run_once(loop=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
