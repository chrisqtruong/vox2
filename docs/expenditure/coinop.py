#!/usr/bin/env python3
"""Coin-Op: where Vox2's Claude tokens go.

Reads Claude Code's local transcripts (~/.claude/projects/**/*.jsonl), keeps the
sessions that worked on Vox2, sorts every turn into a bucket (meaning check,
Mac port, bug fixes...) and serves a live page at http://localhost:8642.

    python3 docs/expenditure/coinop.py              # live page, updates as you work
    python3 docs/expenditure/coinop.py --snapshot   # write data.json for the website

No installs needed (Python 3.9+ standard library only). Nothing leaves your
computer; the snapshot holds only daily totals per bucket, never your prompts.
"""

import argparse
import json
import re
import sys
import threading
import time
import webbrowser
from collections import defaultdict
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
README = HERE.parent.parent / "README.md"
PORT = 8642

# API list prices, $ per million tokens (Anthropic first-party, 2026-09).
# Cache writes: 1.25x input (5-minute cache) or 2x input (1-hour cache).
PRICES = {
    "claude-opus-5-5": {"in": 4.0, "out": 20.0, "read": 0.20},
    "claude-opus-5": {"in": 5.0, "out": 25.0, "read": 0.50},
    "claude-opus-4-8": {"in": 5.0, "out": 25.0, "read": 0.50},
    "claude-fable-5-1": {"in": 10.0, "out": 50.0, "read": 0.25},
    "claude-fable-5": {"in": 10.0, "out": 50.0, "read": 1.00},
    "claude-sonnet-5-5": {"in": 2.0, "out": 10.0, "read": 0.20},
    "claude-sonnet-5": {"in": 2.0, "out": 10.0, "read": 0.20},
    "claude-sonnet-4-6": {"in": 3.0, "out": 15.0, "read": 0.30},
    "claude-haiku-4-5": {"in": 1.0, "out": 5.0, "read": 0.10},
}
DEFAULT_MODEL = "claude-opus-5-5"

# ---------------------------------------------------------------- buckets
# Each turn (one prompt + all the work Claude did for it) lands in one bucket.
# Words in the prompt count most; files Claude touched break ties and decide
# short prompts like "yes do it". Edit these lists to tune the sorting.

BUCKETS = [
    {"id": "meaning", "name": "Meaning & match score", "color": "#ff4d8d", "theme": "trust",
     "words": r"meaning|match score|match check|back.?trans|false alarm|bench|held.?out|negation|100% match|score|phase 1|untranslated",
     "files": r"meaning|checkBack"},
    {"id": "capture", "name": "Snip, voice & audio", "color": "#ffb000", "theme": "daily",
     "words": r"snip|ocr|tesseract|dictat|screen ?text|live text|text reader|apple'?s reader|read aloud|listen|voice|audio|speed|esc\b|conversation",
     "files": r"ocr|snip|dictation|xcap|vision|tts|speech|audio"},
    {"id": "look", "name": "Look, feel & features", "color": "#4dd2ff", "theme": "daily",
     "words": r"theme|colou?r|setting|button|hover|bubble|layout|toggle|colorblind|search|star|icon|font|fade|shortcut|tone|pronoun|glossary|explain this|mini mode",
     "files": r"\.css|theme|settings|bubble\.html"},
    {"id": "mac", "name": "Mac version", "color": "#9b6bff", "theme": "reach",
     "words": r"\bmac|macos|macbook|permission|accessib|screen recording|input monitoring|signature|certificate|signing|\.dmg|notariz",
     "files": r"permissions\.rs|entitlements|Info\.plist|google\.rs|mod mac"},
    {"id": "bugs", "name": "Bug squashing", "color": "#ff6b3d", "theme": "upkeep",
     "words": r"bug|crash|broken|not working|doesn.?t (?:seem to )?work|isn.?t working|not showing|doesn.?t show|wrong|garbl|still (?:no|not|see)|quit unexpectedly|finn?icky|404|error",
     "files": r"$^"},
    {"id": "ship", "name": "Releases & GitHub", "color": "#3ddc84", "theme": "upkeep",
     "words": r"merge|release|\bci\b|workflow|github|git pull|branch|0\.4\.\d+|install|download|tidy|reconcil|uninstall",
     "files": r"\.github/workflows|tauri\.conf|Cargo\.(?:toml|lock)|gh (?:pr|release|workflow|run)"},
    {"id": "docs", "name": "Docs & planning", "color": "#f2f2f2", "theme": "upkeep",
     "words": r"readme|document|roadmap|handoff|report|\bgif|docs|plan\b|ideas?\b|innovative|changelog|expenditure|coin.?op",
     "files": r"README|CHANGELOG|CLAUDE\.md|docs/"},
    {"id": "learn", "name": "Learning & questions", "color": "#ffe14d", "theme": "upkeep",
     "words": r"layman|analogy|confused|confusred|what is|whats|what's|how does|why|what does|common thing|explain to me|what in|is it cause",
     "files": r"$^"},
]
# Prompt words that mean "something's broken" weigh a bit more than topic words.
WORD_WEIGHT = {"bugs": 4, "mac": 4}

THEMES = [
    {"id": "trust", "name": "Trustworthy", "blurb": "Can you rely on what Vox2 tells you? The meaning check and match score.",
     "roadmap": True},
    {"id": "daily", "name": "Useful every day", "blurb": "Snip, voice, the window and the helpers you reach for daily.",
     "roadmap": True},
    {"id": "reach", "name": "Reach more people", "blurb": "Mac, Intel, signed installers: Vox2 on more computers.",
     "roadmap": True},
    {"id": "upkeep", "name": "Upkeep", "blurb": "Bugs, releases, docs and learning. Not on the roadmap, but it keeps the lights on.",
     "roadmap": False},
]

VOX2_PATH = re.compile(r"[/\\]vox2(?:[/\\\"']|$)|chrisqtruong/vox2", re.I)
OTHER_PATH = re.compile(r"chris-site|purrmodoro", re.I)  # Chris's other projects
COMPILED = [(b["id"], re.compile(b["words"], re.I), re.compile(b["files"], re.I)) for b in BUCKETS]


def classify(prompt, touched):
    """Return a bucket id, or None if the turn gives no clue."""
    scores = defaultdict(float)
    for bid, words, _ in COMPILED:
        hits = len(set(m.group(0).lower() for m in words.finditer(prompt)))
        if hits:
            scores[bid] += min(hits, 3) * WORD_WEIGHT.get(bid, 3)
    if touched:
        counts = defaultdict(int)
        for t in touched:
            for bid, _, files in COMPILED:
                if files.search(t):
                    counts[bid] += 1
        total = sum(counts.values())
        for bid, n in counts.items():
            scores[bid] += 4 * n / total
    if not scores:
        return None
    order = [b["id"] for b in BUCKETS]
    return max(scores, key=lambda b: (scores[b], -order.index(b)))


# ---------------------------------------------------------------- transcripts

def prompt_text(msg):
    c = msg.get("content")
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        if any(isinstance(x, dict) and x.get("type") == "tool_result" for x in c):
            return None
        return " ".join(x.get("text", "") for x in c if isinstance(x, dict) and x.get("type") == "text")
    return None


def tool_strings(content):
    out = []
    for block in content if isinstance(content, list) else []:
        if isinstance(block, dict) and block.get("type") == "tool_use":
            inp = block.get("input") or {}
            for key in ("file_path", "path", "command", "notebook_path", "url"):
                v = inp.get(key)
                if isinstance(v, str):
                    out.append(v[:400])
    return out


def cost_of(model, u):
    p = PRICES.get(model, PRICES[DEFAULT_MODEL])
    cc = u.get("cache_creation") or {}
    w5 = cc.get("ephemeral_5m_input_tokens")
    w1 = cc.get("ephemeral_1h_input_tokens")
    if w5 is None and w1 is None:
        w5, w1 = u.get("cache_creation_input_tokens", 0), 0
    w5, w1 = w5 or 0, w1 or 0
    inp, out, read = u.get("input_tokens", 0), u.get("output_tokens", 0), u.get("cache_read_input_tokens", 0)
    dollars = (inp * p["in"] + out * p["out"] + w5 * p["in"] * 1.25 + w1 * p["in"] * 2 + read * p["read"]) / 1e6
    if u.get("speed") == "fast":
        dollars *= 2
    return dollars, {"input": inp, "output": out, "cache_write": w5 + w1, "cache_read": read}


def parse_file(path):
    """One transcript -> {session_id: [events]} in file order."""
    sessions = defaultdict(list)
    seen = {}
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            sid, ts, kind = d.get("sessionId"), d.get("timestamp"), d.get("type")
            if not sid or not ts:
                continue
            msg = d.get("message") or {}
            if kind == "user" and not d.get("isMeta") and not d.get("isSidechain"):
                text = prompt_text(msg)
                if text is None or text.startswith("[Request interrupted"):
                    continue
                # Summaries after a context compaction and "background task finished"
                # notes aren't new requests; they carry on the turn before.
                cont = bool(d.get("isCompactSummary")) or text.startswith(("This session is being continued", "<task-notification", "<system-reminder"))
                sessions[sid].append({"k": "prompt", "ts": ts, "text": text.strip(), "cont": cont})
            elif kind == "assistant":
                tools = tool_strings(msg.get("content"))
                mid = msg.get("id") or d.get("uuid")
                u = msg.get("usage")
                if mid in seen:  # streamed blocks of one reply repeat the same usage
                    ev = seen[mid]
                    ev["tools"] += tools
                    if u:
                        ev["usage"] = u
                    continue
                ev = {"k": "reply", "ts": ts, "model": msg.get("model"), "usage": u, "tools": tools}
                seen[mid] = ev
                sessions[sid].append(ev)
    return sessions


_cache = {}  # path -> (mtime, size, parsed)


def load_all(roots):
    sessions = defaultdict(list)
    for root in roots:
        for p in Path(root).expanduser().glob("**/*.jsonl"):
            try:
                st = p.stat()
            except OSError:
                continue
            key = str(p)
            hit = _cache.get(key)
            if not hit or hit[0] != st.st_mtime or hit[1] != st.st_size:
                hit = (st.st_mtime, st.st_size, parse_file(p))
                _cache[key] = hit
            for sid, evs in hit[2].items():
                sessions[sid].extend(evs)
    return sessions


def build_turns(events):
    events.sort(key=lambda e: e["ts"])
    turns, cur = [], None
    for e in events:
        if e["k"] == "prompt":
            cur = {"ts": e["ts"], "prompt": e["text"], "cont": e["cont"], "replies": []}
            turns.append(cur)
        elif cur is not None:
            cur["replies"].append(e)
    return turns


def scope(turn):
    """'other' if the turn touched another project, 'vox2' if only Vox2, else None."""
    strings = [s for r in turn["replies"] for s in r["tools"]]
    if any(OTHER_PATH.search(s) for s in strings):
        return "other"
    if any(VOX2_PATH.search(s) for s in strings):
        return "vox2"
    return None


def is_vox2(turns):
    """A Vox2 session works mostly in the Vox2 repo, or says so up front."""
    scopes = [scope(t) for t in turns]
    vox, other = scopes.count("vox2"), scopes.count("other")
    said_so = any("vox2" in t["prompt"].lower() for t in turns[:2])
    return vox >= 1 and (vox > other or (said_so and not other))


# ---------------------------------------------------------------- roadmap

VALUE = {"very high": 4, "high": 3, "medium-high": 2.5, "medium": 2, "low": 1}
EFFORT = {"small": 1, "medium": 2, "large": 3}


def parse_roadmap():
    try:
        text = README.read_text(encoding="utf-8")
    except OSError:
        return {"items": [], "done": []}
    m = re.search(r"^## Roadmap\s*$(.*?)^## ", text, re.M | re.S)
    if not m:
        return {"items": [], "done": []}
    block = m.group(1)
    items = []
    for line in block.splitlines():
        im = re.match(r"^(\d+)\. \*\*(.+?)\*\*(.*)$", line.strip())
        if not im:
            continue
        n, title, rest = int(im.group(1)), im.group(2).rstrip("."), im.group(3)
        tag = re.search(r"\*(Very high|High|Medium-high|Medium|Low)\s*·\s*(small|medium|large)([^·]*)·\s*([^.*]+)\.?\*", rest)
        value = tag.group(1) if tag else "Medium"
        effort = tag.group(2) if tag else "medium"
        cost = bool(tag and "cost" in tag.group(3))
        issue = re.search(r"\(\[#(\d+)\]", rest)
        status = "started" if re.search(r"\b(Shipped|Started):", rest) else "open"
        low = title.lower()
        theme = "trust" if "meaning check" in low else "reach" if re.search(r"\bmac\b|signing|notariz|intel", low) else "daily"
        score = VALUE.get(value.lower(), 2) / (EFFORT.get(effort, 2) + (0.5 if cost else 0))
        items.append({"n": n, "title": title, "value": value, "effort": effort + (" + cost" if cost else ""),
                      "issue": int(issue.group(1)) if issue else None, "status": status, "theme": theme,
                      "score": round(score, 2)})
    done = []
    dm = re.search(r"^Done:(.*)$", block, re.M)
    if dm:
        done = [t.strip().rstrip(".") for t in re.findall(r"\*\*(.+?)\*\*", dm.group(1))]
    return {"items": items, "done": done}


def plan_next(roadmap, theme_cost):
    """Recommend what to aim tokens at next, with plain-language reasons."""
    items = roadmap["items"]
    road_themes = [t["id"] for t in THEMES if t["roadmap"]]
    spend = {t: theme_cost.get(t, 0) for t in road_themes}
    spend_total = sum(spend.values()) or 1
    value = defaultdict(float)
    for it in items:
        value[it["theme"]] += VALUE.get(it["value"].lower(), 2)
    value_total = sum(value.values()) or 1
    gaps = {t: value[t] / value_total - spend[t] / spend_total for t in road_themes}

    picks = []
    started = [i for i in items if i["status"] == "started"]
    if started:
        s = started[0]
        picks.append({"n": s["n"], "title": s["title"], "theme": s["theme"],
                      "why": f"Already started and #{s['n']} on the roadmap. Finishing it turns tokens already spent into something people can use."})
    hungry = max(gaps, key=gaps.get) if gaps else None
    pool = [i for i in items if i["status"] == "open"]
    themed = [i for i in pool if i["theme"] == hungry] or pool
    if themed:
        best = max(themed, key=lambda i: (i["score"], -i["n"]))
        share = round(100 * spend[best["theme"]] / spend_total)
        name = next(t["name"] for t in THEMES if t["id"] == best["theme"])
        picks.append({"n": best["n"], "title": best["title"], "theme": best["theme"],
                      "why": f"\"{name}\" holds {round(100 * value[best['theme']] / value_total)}% of the roadmap's value but got {share}% of roadmap spend. "
                             f"This is its best value-for-effort item ({best['value'].lower()} value, {best['effort']} effort)."})
    if pool and len(picks) < 3:
        quick = max((i for i in pool if all(i["n"] != p["n"] for p in picks)), key=lambda i: (i["score"], -i["n"]), default=None)
        if quick:
            picks.append({"n": quick["n"], "title": quick["title"], "theme": quick["theme"],
                          "why": f"Best value for effort left on the roadmap ({quick['value'].lower()} value, {quick['effort']} effort)."})
    return picks, {t: round(g, 3) for t, g in gaps.items()}, {t: round(value[t] / value_total, 3) for t in road_themes}


# ---------------------------------------------------------------- report

def local_day(ts):
    return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone().strftime("%Y-%m-%d")


def build(roots, live):
    sessions = load_all(roots)
    days = defaultdict(lambda: defaultdict(lambda: {"cost": 0.0, "tokens": 0, "output": 0}))
    totals = {"cost": 0.0, "tokens": 0, "input": 0, "output": 0, "cache_write": 0, "cache_read": 0, "turns": 0}
    by_bucket = defaultdict(lambda: {"cost": 0.0, "tokens": 0, "output": 0, "turns": 0})
    recent, kept = [], []
    for sid, events in sessions.items():
        turns = build_turns(events)
        if not is_vox2(turns):
            continue
        kept.append(sid)
        prev = "docs"
        for t in turns:
            if scope(t) == "other":  # e.g. a website turn inside a mostly-Vox2 session
                continue
            touched = [s for r in t["replies"] for s in r["tools"]]
            bucket = prev if t["cont"] else (classify(t["prompt"], touched) or prev)
            prev = bucket
            tcost, ttok = 0.0, 0
            for r in t["replies"]:
                if not r.get("usage") or r.get("model") in (None, "<synthetic>"):
                    continue
                dollars, parts = cost_of(r["model"], r["usage"])
                tok = sum(parts.values())
                cell = days[local_day(r["ts"])][bucket]
                cell["cost"] += dollars
                cell["tokens"] += tok
                cell["output"] += parts["output"]
                for k, v in parts.items():
                    totals[k] += v
                totals["cost"] += dollars
                totals["tokens"] += tok
                tcost += dollars
                ttok += tok
            if not t["replies"]:
                continue
            totals["turns"] += 1
            b = by_bucket[bucket]
            b["cost"] += tcost
            b["tokens"] += ttok
            b["turns"] += 1
            if live and not t["cont"]:
                recent.append({"ts": t["ts"], "bucket": bucket, "prompt": t["prompt"][:120], "cost": round(tcost, 2), "tokens": ttok})
    for d in days.values():
        for bid, cell in d.items():
            by_bucket[bid]["output"] += cell["output"]

    theme_of = {b["id"]: b["theme"] for b in BUCKETS}
    theme_cost = defaultdict(float)
    for bid, v in by_bucket.items():
        theme_cost[theme_of[bid]] += v["cost"]
    roadmap = parse_roadmap()
    picks, gaps, value_share = plan_next(roadmap, theme_cost)
    on_road = sum(theme_cost[t["id"]] for t in THEMES if t["roadmap"])
    recent.sort(key=lambda r: r["ts"])

    return {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "live": live,
        "pricing": {"model": DEFAULT_MODEL, **PRICES[DEFAULT_MODEL]},
        "sessions": len(kept),
        "buckets": [{k: b[k] for k in ("id", "name", "color", "theme")} | {k: round(v, 4) if isinstance(v, float) else v for k, v in by_bucket[b["id"]].items()} for b in BUCKETS],
        "themes": [t | {"cost": round(theme_cost[t["id"]], 4), "value_share": value_share.get(t["id"]), "gap": gaps.get(t["id"])} for t in THEMES],
        "days": [{"date": d, "by": {b: {k: round(v, 4) if isinstance(v, float) else v for k, v in c.items()} for b, c in days[d].items()}} for d in sorted(days)],
        "totals": {k: round(v, 4) if isinstance(v, float) else v for k, v in totals.items()},
        "alignment": round(on_road / (sum(theme_cost.values()) or 1), 3),
        "roadmap": roadmap,
        "next": picks,
        "recent": recent[-12:],
    }


# ---------------------------------------------------------------- server

class Handler(SimpleHTTPRequestHandler):
    roots = []
    lock = threading.Lock()

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(HERE), **kw)

    def do_GET(self):
        if self.path.split("?")[0] == "/data.json":
            with self.lock:
                body = json.dumps(build(self.roots, live=True)).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, *a):
        pass


def main():
    ap = argparse.ArgumentParser(description="Coin-Op: Vox2 project expenditure")
    ap.add_argument("--snapshot", action="store_true", help="write data.json (no prompts) and exit")
    ap.add_argument("--projects", action="append", help="extra transcript folder (repeatable), e.g. a copy from another computer")
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--no-open", action="store_true", help="don't open the browser")
    args = ap.parse_args()
    roots = [Path.home() / ".claude" / "projects"] + [Path(p) for p in args.projects or []]

    if args.snapshot:
        data = build(roots, live=False)
        (HERE / "data.json").write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8")
        t = data["totals"]
        print(f"data.json: {data['sessions']} sessions, {t['turns']} turns, {t['tokens']:,} tokens, ~${t['cost']:,.2f}")
        return

    Handler.roots = roots
    build(roots, live=True)  # warm the cache before the first page load
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    url = f"http://localhost:{args.port}"
    print(f"Coin-Op is live at {url}  (Ctrl+C to stop)")
    if not args.no_open:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
