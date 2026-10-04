"""Test for the "can't check" rule (resources/meaning-checks.js, untranslated()): text that came
through a translation untranslated must be caught, and good translations must not be.

  python3 untranslated.py fetch out.json   # garbled sentences translated by Google (uses curl)
  python3 untranslated.py score out.json   # score them, plus every good translation in the reports

Good translations come from docs/meaning-check-tests/*-results.json. The rule here mirrors the JS.
"""
import glob, json, random, re, subprocess, sys, time, urllib.parse

TOKEN = re.compile(r"[^\W\d_]+(?:['’][^\W\d_]+)*|\d+|[^\s\w]", re.U)
is_word = lambda t: bool(re.match(r"[^\W\d_]", t))
is_lower = lambda w: w == w.lower() and w != w.upper()
COPIED_RUN, COPIED_SHARE = 6, 0.8

def untranslated(original, translation):
    mine = TOKEN.findall(original)
    words = {w.lower() for w in mine if is_word(w)}
    numbers = {t for t in mine if t.isdigit()}
    run = best = 0
    for t in TOKEN.findall(translation):
        if is_word(t) and t.lower() in words:
            run += 1 if is_lower(t) else 0.5
            best = max(best, run)
        elif t not in numbers and t not in {",", ".", "'", "’", "-"}:
            run = 0
    if best >= COPIED_RUN:
        return True
    theirs = {w.lower() for w in TOKEN.findall(translation) if is_word(w)}
    all_ = [w.lower() for w in mine if is_word(w)]
    return len(all_) >= 4 and sum(w in theirs for w in all_) / len(all_) >= COPIED_SHARE

def fetch(path):
    rnd = random.Random(7)
    def tok():  # OCR-like junk: short letter clumps, some capitalized, some numbers
        n = rnd.choice([1, 2, 2, 2, 3, 3, 4, 5, 6, 7])
        w = "".join(rnd.choice("bcdfghjklmnprstvwlnmrs" if i % 2 == rnd.randint(0, 1) else "aeiou") for i in range(n))
        r = rnd.random()
        return w.capitalize() if r < .3 else (str(rnd.randint(0, 99999)) if r < .38 else w)
    junk = lambda n: " ".join(tok() for _ in range(n))
    def google(q, tl):
        u = f"https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl={tl}&q=" + urllib.parse.quote(q)
        for a in range(4):
            try:
                d = json.loads(subprocess.run(["curl", "-sf", "--max-time", "15", u], capture_output=True, check=True).stdout)
                return d[0] if isinstance(d[0], str) else d[0][0]
            except Exception:
                time.sleep(3 * (a + 1))
        raise RuntimeError("Google didn't answer")
    sents = [it["en"] for it in json.load(open("items-v3.json"))["items"]][::7][:20]
    out = []
    for s in sents:
        w = s.split()
        cases = {"tail garbage": " ".join(w[: len(w) // 2]) + " " + junk(rnd.randint(8, 14)),
                 "short garbage": s + " " + junk(rnd.randint(2, 4)), "all garbage": junk(rnd.randint(6, 16))}
        for kind, text in cases.items():
            for tl in ["vi", "es", "tl", "zh-CN", "ja", "ar"]:
                out.append({"kind": kind, "tl": tl, "text": text, "translation": google(text, tl)})
                time.sleep(0.15)
    json.dump(out, open(path, "w"), ensure_ascii=False, indent=1)

def score(path):
    good = [(r["en"], r["translation"]) for f in sorted(glob.glob("../../docs/meaning-check-tests/*-results.json"))
            for r in json.load(open(f)) if r["kind"].startswith("good") and "translation" in r]
    print(f"good translations flagged: {sum(untranslated(a, b) for a, b in good)} of {len(good)}")
    rows = json.load(open(path))
    for kind in ["tail garbage", "all garbage", "short garbage"]:
        k = [r for r in rows if r["kind"] == kind]
        print(f"{kind}: caught {sum(untranslated(r['text'], r['translation']) for r in k)} of {len(k)}")

if __name__ == "__main__":
    {"fetch": fetch, "score": score}[sys.argv[1]](sys.argv[2])
