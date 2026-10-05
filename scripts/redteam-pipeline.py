#!/usr/bin/env python3
"""redteam-pipeline.py — Pipeline direktur tim Red Team.

Brief masuk di workspace/briefs/ -> Ketua Tim memecah (00) -> Pengacara Bantah
dan Penyelidik Fakta paralel (01, 03) -> Analis Risiko dan Ekonom paralel
(02, 04) -> Penulis Memo mengunci memo final.

Setiap tahap: event kantor (agent_spawned/working/completed) + pesan chat.

Usage:
    python3 scripts/redteam-pipeline.py <brief_path>   # proses satu brief
    python3 scripts/redteam-pipeline.py --loop         # pantau folder briefs
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WORKSPACE = os.path.join(ROOT, "workspace")
BRIEFS = os.path.join(WORKSPACE, "briefs")
ARTIFACTS = os.path.join(WORKSPACE, "artifacts")
FINAL = os.path.join(WORKSPACE, "final")
SKILLS = os.path.join(ROOT, "skills", "roles")
SERVER = "http://127.0.0.1:3334"
STATE_DIR = os.path.join(os.path.expanduser("~"), ".agent-office")
STATE_FILE = os.path.join(STATE_DIR, "pipeline-state.json")
LOCK_FILE = os.path.join(STATE_DIR, "pipeline.lock")
TOKEN_FILE = os.path.join(STATE_DIR, "auth-token")
BRIEF_EXTS = {".md", ".txt", ".pdf", ".doc", ".docx"}

ROLES = {
    "ketua":     {"name": "Ketua Tim",         "skill": "ketua.md",     "file": "00_brief_breakdown.md"},
    "pengacara": {"name": "Pengacara Bantah",  "skill": "pengacara.md", "file": "01_counter_arguments.md"},
    "risiko":    {"name": "Analis Risiko",     "skill": "risiko.md",    "file": "02_risk_matrix.md"},
    "fakta":     {"name": "Penyelidik Fakta",  "skill": "fakta.md",     "file": "03_fact_audit.md"},
    "ekonom":    {"name": "Ekonom",            "skill": "ekonom.md",    "file": "04_financial_feasibility.md"},
    "penulis":   {"name": "Penulis Memo",      "skill": "penulis.md",   "file": "EXECUTIVE_MEMO.md"},
}


def log(msg):
    print(f"[pipeline] {msg}", flush=True)


def read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def auth_headers():
    token = read(TOKEN_FILE).strip()
    return {"Authorization": f"Bearer {token}"} if token else {}


def post(url, payload):
    data = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    headers.update(auth_headers())
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        urllib.request.urlopen(req, timeout=5)
        return True
    except Exception:
        return False


def send_event(payload):
    return post(f"{SERVER}/event", payload)


def chat(sender, role, text):
    return post(f"{SERVER}/chat/reply", {"sender": sender, "role": role, "text": text})


def call_llm(prompt, role=None, timeout=240, retries=3):
    cmd = [sys.executable, os.path.join(ROOT, "scripts", "llm-reply.py")]
    if role:
        cmd += ["--role", role]
    for attempt in range(1, retries + 1):
        try:
            out = subprocess.run(
                cmd, input=prompt, capture_output=True, text=True, timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            out = None
        text = (out.stdout or "").strip() if out else ""
        if out and out.returncode == 0 and text:
            return text
        err = (out.stderr or "").strip()[:200] if out else "timeout"
        log(f"LLM gagal (percobaan {attempt}/{retries}): {err}")
        if attempt < retries:
            time.sleep(10 * attempt)
    return ""


def strip_fences(text):
    t = text.strip()
    m = re.match(r"^```(?:markdown|md)?\s*\n(.*)\n```\s*$", t, re.S)
    return (m.group(1).strip() if m else t) + "\n"


def skill_prompt(role_key, task, extra=""):
    g = read(os.path.join(SKILLS, "global.md"))
    r = read(os.path.join(SKILLS, ROLES[role_key]["skill"]))
    return (
        f"{g}\n\n"
        f"===== SKILL PERAN: {ROLES[role_key]['name']} =====\n{r}\n\n"
        f"===== TUGAS =====\n{task}\n\n{extra}\n"
        "Jawab HANYA dengan isi berkas markdown sesuai struktur di skill. "
        "Tanpa penjelasan tambahan, tanpa komentar pembuka."
    )


def clean_artifacts():
    for k in ("ketua", "pengacara", "risiko", "fakta", "ekonom"):
        p = os.path.join(ARTIFACTS, ROLES[k]["file"])
        if os.path.exists(p):
            os.remove(p)


def run_stage(stage, slug, brief_text, inputs, chat_after):
    info = ROLES[stage]
    aid = f"rt-{slug}-{stage}"
    fname = info["file"]
    out_path = os.path.join(FINAL if stage == "penulis" else ARTIFACTS, fname)
    if stage == "penulis":
        out_path = os.path.join(FINAL, f"EXECUTIVE_MEMO_{slug.upper()}.md")

    send_event({"type": "agent_spawned", "agent": {
        "id": aid, "name": info["name"], "role": stage,
        "task": f"Menyusun {fname}"}})
    send_event({"type": "agent_working", "status": f"{info['name']}: menyusun {fname}"})

    parts = [f"Isi brief:\n{brief_text}\n"]
    for label, path in inputs:
        content = read(path)
        if content:
            parts.append(f"=== {label} ({os.path.basename(path)}) ===\n{content}\n")

    task = {
        "ketua": "Tulis berkas 00_brief_breakdown.md untuk brief di atas.",
        "pengacara": "Tulis berkas 01_counter_arguments.md. Fokus membongkar asumsi dari 00_brief_breakdown.md.",
        "risiko": "Tulis berkas 02_risk_matrix.md. Fokus kegagalan sistemik dari 00_brief_breakdown.md dan 01_counter_arguments.md.",
        "fakta": "Tulis berkas 03_fact_audit.md. Audit semua angka dan klaim kuantitatif dari brief.",
        "ekonom": "Tulis berkas 04_financial_feasibility.md. Uji unit economics memakai angka yang sudah diaudit di 03_fact_audit.md.",
        "penulis": (
            "Tulis memo eksekutif 1 halaman (450-600 kata) dari kelima berkas analis. "
            "Format persis seperti skill. Simpan kendali panjang, tanpa basa-basi."
        ),
    }[stage]

    text = call_llm(skill_prompt(stage, task, "\n".join(parts)), role=stage)
    if not text:
        log(f"{fname} gagal setelah {3}x percobaan LLM")
        send_event({"type": "agent_completed", "agentId": aid,
                    "result": f"{fname} gagal diproses (gangguan LLM)"})
        chat(info["name"], stage, f"{fname} tertunda. Gangguan pemanggilan model, saya ulang nanti.")
        return None

    content = strip_fences(text)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)

    send_event({"type": "agent_completed", "agentId": aid, "result": f"{fname} selesai"})
    chat(info["name"], stage, chat_after(content))
    return out_path


def verdict_of(memo):
    m = re.search(r"Squad Recommendation:\s*\[?([A-Z][A-Z &/]{2,40})", memo)
    if not m:
        return "Rekomendasi ada di memo"
    v = m.group(1).strip(" []")
    return v.split("]")[0].split("/")[0].strip() or v


def run_brief(path):
    slug = os.path.splitext(os.path.basename(path))[0]
    brief = read(path)
    if not brief.strip():
        log(f"brief kosong, dilewati: {path}")
        return False

    if len(brief.split()) < 80:
        log(f"brief terlalu tipis ({len(brief.split())} kata), interogasi ketua: {slug}")
        prompt = skill_prompt(
            "ketua",
            "PROTOKOL PENOLAKAN BRIEF MENTAH. Bos mengirim brief berikut yang isinya terlalu tipis "
            f"untuk dianalisis (hanya {len(brief.split())} kata):\n\n"
            f"{brief[:800]}\n\n"
            "Tolak sesuai skill bagian Protokol Penolakan Brief Mentah: empat parameter minimum yang "
            "relevan dengan isi brief, arahkan ke workspace/briefs/TEMPLAT_BRIEF.md. "
            "Balas HANYA dengan pesan chat siap kirim, maksimal 160 kata, tanpa judul, tanpa daftar markdown berat.",
        )
        msg = call_llm(prompt, role="ketua")
        if msg:
            if msg.startswith("INTEROGASI:"):
                msg = msg.split(":", 1)[1].strip()
            chat("Ketua Tim", "ketua", msg)
        return True

    log(f"memproses brief: {slug}")
    clean_artifacts()

    p00 = run_stage(
        "ketua", slug, brief, [],
        lambda c: (
            f"Brief {slug} selesai saya bedah. Empat vektor terkunci di 00_brief_breakdown.md. "
            "Pengacara Bantah dan Penyelidik Fakta mulai sekarang."
        ),
    )
    if not p00:
        return False
    inputs = [("00_brief_breakdown.md", p00)]

    with ThreadPoolExecutor(max_workers=2) as ex:
        f_peng = ex.submit(run_stage, "pengacara", slug, brief, inputs,
                           lambda c: "01_counter_arguments.md selesai. Premis utama brief tidak punya dasar, "
                                     "tiga kontra-tesis sudah saya kunci.")
        f_fakta = ex.submit(run_stage, "fakta", slug, brief, inputs,
                            lambda c: "03_fact_audit.md selesai. Angka yang tidak punya sumber primer sudah saya tandai.")
        r_peng, r_fakta = f_peng.result(), f_fakta.result()
    if not r_peng or not r_fakta:
        return False

    inputs2 = inputs + [("01_counter_arguments.md", r_peng), ("03_fact_audit.md", r_fakta)]
    with ThreadPoolExecutor(max_workers=2) as ex:
        f_ris = ex.submit(run_stage, "risiko", slug, brief, inputs2,
                          lambda c: "02_risk_matrix.md selesai. Titik mati, ancaman P1, dan kill-switch sudah tercatat.")
        f_eko = ex.submit(run_stage, "ekonom", slug, brief, inputs2,
                          lambda c: "04_financial_feasibility.md selesai. Break-even dan margin kontribusi ada di file.")
        r_ris, r_eko = f_ris.result(), f_eko.result()
    if not r_ris or not r_eko:
        return False

    inputs3 = inputs2 + [("02_risk_matrix.md", r_ris), ("04_financial_feasibility.md", r_eko)]
    memo = run_stage(
        "penulis", slug, brief, inputs3,
        lambda c: f"EXECUTIVE_MEMO_{slug.upper()}.md terkunci. Rekomendasi tim: {verdict_of(c)}. Baca sebelum memutuskan.",
    )
    if not memo:
        return False

    log(f"memo final: {memo}")
    return True


def acquire_lock():
    os.makedirs(STATE_DIR, exist_ok=True)
    try:
        fd = os.open(LOCK_FILE, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)
        return True
    except FileExistsError:
        return False


def release_lock():
    try:
        os.remove(LOCK_FILE)
    except OSError:
        pass


def load_state():
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(state):
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f)
    except OSError:
        pass


def mark_done(state, path, ok):
    try:
        state[path] = {"mtime": os.path.getmtime(path), "ok": bool(ok), "at": time.time()}
    except OSError:
        state[path] = {"mtime": 0, "ok": bool(ok), "at": time.time()}
    save_state(state)


def process_one(path):
    waited = 0
    while not acquire_lock():
        if waited >= 1800:
            log("kunci pipeline menunggu terlalu lama, dilewati")
            return False
        time.sleep(5)
        waited += 5
    try:
        return run_brief(path)
    finally:
        release_lock()


def loop():
    os.makedirs(BRIEFS, exist_ok=True)
    os.makedirs(ARTIFACTS, exist_ok=True)
    os.makedirs(FINAL, exist_ok=True)
    state = load_state()
    log(f"memantau {BRIEFS} setiap 5 detik (pid {os.getpid()})")
    while True:
        try:
            for name in sorted(os.listdir(BRIEFS)):
                if name.startswith(".") or name.upper().startswith("TEMPLAT"):
                    continue
                path = os.path.join(BRIEFS, name)
                if os.path.splitext(name)[1].lower() not in BRIEF_EXTS:
                    continue
                try:
                    mt = os.path.getmtime(path)
                except OSError:
                    continue
                prev = state.get(path)
                if prev and prev.get("mtime") == mt:
                    # brief gagal diproses: coba ulang tiap 5 menit
                    if prev.get("ok"):
                        continue
                    if time.time() - float(prev.get("at", 0)) < 300:
                        continue
                    log(f"mengulang brief yang gagal: {name}")
                # brief baru atau berubah: proses
                ok = process_one(path)
                mark_done(state, path, ok)
        except Exception as e:
            log(f"galat loop: {e}")
        time.sleep(5)


def main():
    if "--loop" in sys.argv:
        loop()
        return 0
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    path = os.path.abspath(sys.argv[1])
    if not os.path.exists(path):
        print(f"pipeline: berkas tidak ada: {path}", file=sys.stderr)
        return 1
    ok = process_one(path)
    state = load_state()
    mark_done(state, path, ok)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
