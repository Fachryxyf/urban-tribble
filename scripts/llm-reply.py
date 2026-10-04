#!/usr/bin/env python3
"""llm-reply.py — Balas prompt lewat LLM API (OpenAI-compatible).

Config: ~/.agent-office/llm.json  {base_url, model, api_key, max_tokens}
Usage : echo "prompt" | python3 scripts/llm-reply.py
        python3 scripts/llm-reply.py "prompt"
"""
import json
import os
import sys
import urllib.request

CFG_PATH = os.path.expanduser("~/.agent-office/llm.json")


def load_cfg():
    try:
        with open(CFG_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def main():
    if len(sys.argv) > 1:
        prompt = " ".join(sys.argv[1:])
    else:
        prompt = sys.stdin.read()
    prompt = prompt.strip()
    if not prompt:
        return 1

    cfg = load_cfg()
    base = cfg.get("base_url", "").rstrip("/")
    key = cfg.get("api_key", "")
    model = cfg.get("model", "deepseek-v4-flash")
    if not base or not key:
        print("llm-reply: config LLM tidak lengkap di ~/.agent-office/llm.json", file=sys.stderr)
        return 1

    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": int(cfg.get("max_tokens", 1200)),
        "temperature": float(cfg.get("temperature", 0.8)),
    }).encode()

    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.load(resp)
    except Exception as e:
        print(f"llm-reply: gagal panggil API ({e})", file=sys.stderr)
        return 1

    try:
        msg = data["choices"][0]["message"]
        text = (msg.get("content") or "").strip()
    except Exception:
        text = ""
    if not text:
        print("llm-reply: balasan kosong", file=sys.stderr)
        return 1
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
