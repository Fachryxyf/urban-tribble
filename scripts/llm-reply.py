#!/usr/bin/env python3
"""llm-reply.py — Panggil LLM API (OpenAI-compatible) dengan konfigurasi env.

Sumber konfigurasi (prioritas menurun):
  1. environment proses (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, ...)
  2. berkas .env di root repo
  3. ~/.agent-office/llm.json (kompatibilitas lama)
  4. nilai bawaan

Model per role: --role ketua memakai LLM_MODEL_KETUA dari env/.env,
fallback ke LLM_MODEL.

Usage:
  echo "prompt" | python3 scripts/llm-reply.py --role ketua
  python3 scripts/llm-reply.py --model deepseek-v4-pro "prompt"
  echo "prompt" | python3 scripts/llm-reply.py            # model fallback
"""
import json
import os
import sys
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENV_PATH = os.path.join(ROOT, ".env")
CFG_PATH = os.path.expanduser("~/.agent-office/llm.json")


def load_env():
    env = {}
    # .env dulu (proses env menimpanya)
    try:
        with open(ENV_PATH, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    # environment proses menang
    for k, v in os.environ.items():
        if k.startswith("LLM_"):
            env[k] = v
    # llm.json sebagai fallback bila env kosong
    try:
        with open(CFG_PATH, encoding="utf-8") as f:
            legacy = json.load(f)
    except Exception:
        legacy = {}
    env.setdefault("LLM_BASE_URL", legacy.get("base_url", ""))
    env.setdefault("LLM_API_KEY", legacy.get("api_key", ""))
    env.setdefault("LLM_MODEL", legacy.get("model", "deepseek-v4-flash"))
    env.setdefault("LLM_MAX_TOKENS", str(legacy.get("max_tokens", 6000)))
    env.setdefault("LLM_TEMPERATURE", str(legacy.get("temperature", 0.8)))
    return env


def parse_args(argv):
    role = None
    model = None
    rest = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--role" and i + 1 < len(argv):
            role = argv[i + 1].upper()
            i += 2
        elif a == "--model" and i + 1 < len(argv):
            model = argv[i + 1]
            i += 2
        else:
            rest.append(a)
            i += 1
    return role, model, " ".join(rest)


def main():
    role, model_arg, arg_prompt = parse_args(sys.argv[1:])
    prompt = arg_prompt if arg_prompt else sys.stdin.read()
    prompt = prompt.strip()
    if not prompt:
        return 1

    env = load_env()
    base = (env.get("LLM_BASE_URL") or "").rstrip("/")
    key = env.get("LLM_API_KEY") or ""
    if not base or not key:
        print("llm-reply: LLM_BASE_URL / LLM_API_KEY belum diisi (.env)", file=sys.stderr)
        return 1

    model = model_arg
    if not model and role:
        model = env.get(f"LLM_MODEL_{role}") or env.get("LLM_MODEL")
    model = model or env.get("LLM_MODEL") or "deepseek-v4-flash"

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": int(env.get("LLM_MAX_TOKENS", 6000)),
        "temperature": float(env.get("LLM_TEMPERATURE", 0.8)),
    }

    def send(pl):
        r = urllib.request.Request(
            f"{base}/chat/completions",
            data=json.dumps(pl).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
            method="POST",
        )
        with urllib.request.urlopen(r, timeout=120) as resp:
            return json.load(resp)

    try:
        data = send(payload)
    except Exception as e:
        print(f"llm-reply: gagal panggil API ({e})", file=sys.stderr)
        return 1

    try:
        msg = data["choices"][0]["message"]
        text = (msg.get("content") or "").strip()
    except Exception:
        msg, text = {}, ""

    # Model reasoning-only (konten kosong): dorong model menulis hasil akhirnya
    if not text:
        reasoning = (msg.get("reasoning_content") or "").strip()
        if reasoning:
            followup = dict(payload)
            followup["messages"] = [
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": reasoning[:6000]},
                {"role": "user", "content": "Lanjutkan. Tulis hasil akhir sekarang dalam satu jawaban utuh, tanpa penalaran tambahan."},
            ]
            try:
                data2 = send(followup)
                text = (data2["choices"][0]["message"].get("content") or "").strip()
            except Exception:
                text = ""
    if not text:
        print("llm-reply: balasan kosong", file=sys.stderr)
        return 1
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
