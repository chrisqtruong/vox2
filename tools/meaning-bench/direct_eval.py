"""Direct-comparison experiment (2026-10-04): does comparing your text with the *translation* (not
only the ↩ line) catch more errors? And which "missed" errors never reached the translation?

  python3 direct_embed.py <results.json> feats.json        # needs numpy, onnxruntime, tokenizers + the app's model files
  jsc -m dump-scores.mjs -- <results.json> > scores.json   # today's scores per row
  python3 direct_eval.py <results.json> feats.json scores.json
"""
import collections, json, sys
rows, F, S = (json.load(open(p)) for p in sys.argv[1:4])
gap = lambda f: f["backfwd"] - f["direct"]  # how much closer the ↩ line is to the translation than your text is
pct = lambda xs: 100 * sum(xs) / len(xs)

def evaluate(split, flag, cap):
    g = [(r, f, s) for r, f, s in zip(rows, F, S) if r["split"] == split]
    sc = lambda r, f, s: min(s, cap) if flag(r, f) else s
    good = [x for x in g if x[0]["kind"] != "bad"]; bad = [x for x in g if x[0]["kind"] == "bad"]
    return pct([sc(*x) < 85 for x in bad]), pct([sc(*x) < 65 for x in good]), pct([sc(*x) >= 85 for x in good])

print("baseline (today's checks): dev %.1f%% caught / %.1f%% false alarms / %.1f%% kept;  test %.1f / %.1f / %.1f" % (*evaluate("dev", lambda r, f: False, 60), *evaluate("test", lambda r, f: False, 60)))
for cap, label in [(60, "flag as likely off (60)"), (84, "flag as check the details (84)")]:
    print(f"\nnew rule: gap > T, {label}; Tagalog skipped (the model can't read it)")
    for T in [0.02, 0.04, 0.06, 0.08, 0.10, 0.13]:
        flag = lambda r, f: r["lang"] != "tgl_Latn" and gap(f) > T
        print("  T=%.2f  dev %.1f / %.1f / %.1f   test %.1f / %.1f / %.1f" % (T, *evaluate("dev", flag, cap), *evaluate("test", flag, cap)))

good_google = {(r["lang"], r["id"]): r["translation"] for r in rows if r["kind"] == "good: Google"}
squash = lambda s: "".join(s.lower().split())
tot, same, missed, missed_same = (collections.Counter() for _ in range(4))
for r, s in zip(rows, S):
    if r["kind"] != "bad" or r["split"] != "test": continue
    identical = squash(good_google[(r["lang"], r["id"])]) == squash(r["translation"])
    tot[r["error"]] += 1; same[r["error"]] += identical
    if s >= 85: missed[r["error"]] += 1; missed_same[r["error"]] += identical
print("\nheld-out planted errors whose translation is identical to Google's good one (never reached the output):")
for e in sorted(tot): print(f"  {e:14} {same[e]}/{tot[e]};  of those missed: {missed_same[e]}/{missed[e]}")
T, SA, M, MS = sum(tot.values()), sum(same.values()), sum(missed.values()), sum(missed_same.values())
print(f"caught, of errors that reached the translation: {100 * (T - SA - (M - MS)) / (T - SA):.1f}% (n={T - SA})")
