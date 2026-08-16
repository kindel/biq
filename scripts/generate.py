#!/usr/bin/env python3
"""Resume-safe generator for hire / no-hire example packs."""

import json
import os
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANK = os.path.join(ROOT, "data", "questions.json")
OUT_DIR = os.path.join(ROOT, "data", "examples")
PROMPT = os.path.join(ROOT, "prompt.md")
LOG = os.path.join(ROOT, "data", "examples-progress.json")
API = "https://api.x.ai/v1/chat/completions"
MODEL = "grok-4.3"
WORKERS = 3
TIMEOUT = 180
RETRIES = 3
LEVELS = ("junior", "senior", "exec")

SCHEMA = """
Return JSON only. No markdown. No fence.

All-levels keys:
{
  "question": "restated question",
  "principle": "main principle + any secondary",
  "levels": {
    "junior": {
      "raiseTranscript": [{"role":"candidate","text":"..."},{"role":"interviewer","text":"..."}],
      "raiseNotes": ["Q: ...", "story bullet", "quote", "Follow-up: ..."],
      "raiseFeedback": "...",
      "lowerTranscript": [...],
      "lowerNotes": [...],
      "lowerFeedback": "..."
    },
    "senior": { "same keys as junior": true },
    "exec": { "same keys as junior": true }
  },
  "diagnostic": [{"signal":"...","junior":"...","senior":"...","exec":"..."}]
}

Single-level keys (only when the user asks for one level):
{
  "question": "...",
  "principle": "...",
  "level": "senior",
  "raiseTranscript": [...],
  "raiseNotes": [...],
  "raiseFeedback": "...",
  "lowerTranscript": [...],
  "lowerNotes": [...],
  "lowerFeedback": "...",
  "diagnostic": [{"signal":"...","raises":"...","lowers":"..."}]
}

Give 1-3 follow-ups per transcript. 4-6 diagnostic rows.
Manager is optional. Always include junior, senior, and exec when generating all levels.
"""


def norm(s):
    return " ".join("".join(ch.lower() if ch.isalnum() else " " for ch in (s or "")).split())


def slug_for(p, q):
    key = norm(p) + "|" + norm(q)
    h = 2166136261
    for c in key.encode("ascii"):
        h ^= c
        h = (h * 16777619) & 0xFFFFFFFF
    return f"{h:08x}"


def key_for(principle, question):
    return norm(principle) + "|" + norm(question)


def is_level_sheet(d):
    return bool(
        d
        and isinstance(d.get("raiseTranscript"), list) and d["raiseTranscript"]
        and isinstance(d.get("lowerTranscript"), list) and d["lowerTranscript"]
        and d.get("raiseFeedback")
        and d.get("lowerFeedback")
    )


def is_pack(d):
    if not d or not isinstance(d.get("levels"), dict):
        return False
    return all(is_level_sheet(d["levels"].get(k)) for k in LEVELS)


def parse_json(text):
    if not text:
        return None
    t = str(text).strip()
    if t.startswith("```"):
        lines = t.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        t = "\n".join(lines).strip()
    try:
        direct = json.loads(t)
        if is_pack(direct) or is_level_sheet(direct):
            return direct
    except Exception:
        pass
    start = 0
    last = t.rfind("}")
    while start < last:
        i = t.find("{", start)
        if i < 0 or i >= last:
            break
        try:
            obj = json.loads(t[i : last + 1])
            if is_pack(obj) or is_level_sheet(obj):
                return obj
        except Exception:
            pass
        start = i + 1
    return None


def existing_valid(slug):
    path = os.path.join(OUT_DIR, slug + ".json")
    if not os.path.exists(path):
        return False
    try:
        return is_pack(json.load(open(path)))
    except Exception:
        return False


def system_prompt():
    body = open(PROMPT, encoding="utf-8").read().strip()
    return body + "\n\n" + SCHEMA.strip() + "\n"


def call(job, sys_prompt, api_key):
    user = "\n".join(
        [
            "Principle: " + job["principle"],
            "Question: " + job["question"],
            "Generate all three levels: junior, senior, and exec. Use the all-levels JSON keys.",
        ]
    )
    payload = json.dumps(
        {
            "model": MODEL,
            "temperature": 0.6,
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user},
            ],
        }
    ).encode()
    last_err = None
    for attempt in range(1, RETRIES + 1):
        try:
            req = urllib.request.Request(
                API,
                data=payload,
                headers={
                    "Authorization": "Bearer " + api_key,
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                raw = json.loads(resp.read().decode())
            text = (((raw.get("choices") or [{}])[0].get("message") or {}).get("content")) or ""
            data = parse_json(text)
            if not is_pack(data):
                keys = list(data.keys()) if isinstance(data, dict) else type(data).__name__
                raise ValueError("incomplete pack: " + str(keys))
            return data
        except Exception as e:
            last_err = str(e)
            time.sleep(1.5 * attempt)
    raise RuntimeError(last_err or "failed")


def write_log(payload):
    json.dump(payload, open(LOG, "w"), indent=2)


def main():
    api_key = os.environ.get("XAI_API_KEY") or ""
    if not api_key:
        raise SystemExit("Set XAI_API_KEY to regenerate example packs.")

    os.makedirs(OUT_DIR, exist_ok=True)
    bank = json.load(open(BANK))
    company = (os.environ.get("BIQ_COMPANY") or "").strip().lower()
    principles = []
    if bank.get("companies"):
        for c in bank["companies"]:
            if company and c.get("id") != company:
                continue
            principles.extend(c.get("principles") or [])
    else:
        principles = bank.get("principles") or []
    jobs = []
    for p in principles:
        for q in p.get("questions") or []:
            jobs.append(
                {
                    "principle": p.get("name") or "",
                    "question": q.get("text") or "",
                    "kind": p.get("kind") or "lp",
                }
            )

    pending = []
    have = 0
    for j in jobs:
        slug = slug_for(j["principle"], j["question"])
        if existing_valid(slug):
            have += 1
        else:
            pending.append(j)

    print(f"total={len(jobs)} have={have} pending={len(pending)}", flush=True)
    if not pending:
        write_log({"ok": 0, "fail": 0, "have": have, "pending": 0, "failures": []})
        print(f"done have={have} new_ok=0 fail=0", flush=True)
        return

    sys_prompt = system_prompt()
    ok = 0
    fail = []
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(call, j, sys_prompt, api_key): j for j in pending}
        for fut in as_completed(futs):
            j = futs[fut]
            slug = slug_for(j["principle"], j["question"])
            try:
                pack = fut.result()
                pack["principle"] = j["principle"]
                pack["kind"] = j["kind"]
                json.dump(pack, open(os.path.join(OUT_DIR, slug + ".json"), "w"), indent=2)
                ok += 1
            except Exception as e:
                fail.append(
                    {
                        "principle": j["principle"],
                        "question": j["question"],
                        "slug": slug,
                        "error": str(e),
                    }
                )
            if (ok + len(fail)) % 5 == 0 or (ok + len(fail)) == len(pending):
                write_log(
                    {
                        "ok": ok,
                        "fail": len(fail),
                        "have": have + ok,
                        "pending": len(pending),
                        "failures": fail,
                    }
                )
                print(f"progress ok={ok} fail={len(fail)} have={have + ok}", flush=True)

    write_log({"ok": ok, "fail": len(fail), "have": have + ok, "pending": len(pending), "failures": fail})
    print(f"done have={have + ok} new_ok={ok} fail={len(fail)}", flush=True)
    if fail:
        print("FAILURES", json.dumps(fail[:8], indent=2), flush=True)


if __name__ == "__main__":
    main()
