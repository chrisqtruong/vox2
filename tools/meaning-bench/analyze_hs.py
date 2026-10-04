"""Tables for the high-stakes tests (items-hs1.json, items-hs2.json):
  python3 analyze_hs.py <results.json> [split] [scores.json]   (scores.json: from dump-scores.mjs, to score with another version of the checks)
Counts an error as caught when it isn't shown as "meaning kept" (score < 85), as in the other reports,
and also reports "flagged likely off" (< 65). "Reached the translation" leaves out planted errors whose
translation came out identical to the translation of the correct sentence (nothing to catch)."""
import collections, json, sys
rows = json.load(open(sys.argv[1])); split = sys.argv[2] if len(sys.argv) > 2 else "test"
if len(sys.argv) > 3:
    for r, s in zip(rows, json.load(open(sys.argv[3]))): r["score"] = s
rows = [r for r in rows if r["split"] == split]
good_tr = {(r["lang"], r["id"]): r["translation"] for r in rows if r["kind"] != "bad"}
squash = lambda s: "".join(s.lower().split())
pct = lambda xs: f"{100 * sum(xs) / len(xs):.1f}%" if xs else "–"
good = [r for r in rows if r["kind"] != "bad"]; bad = [r for r in rows if r["kind"] == "bad"]
reached = [r for r in bad if squash(r["translation"]) != squash(good_tr[(r["lang"], r["id"])])]
print(f"split: {split}; {len(good)} good and {len(bad)} bad translations ({len(bad) - len(reached)} bad ones identical to the good translation)")
print(f"good shown as meaning kept: {pct([r['score'] >= 85 for r in good])}   false alarms (<65): {pct([r['score'] < 65 for r in good])}")
print(f"errors caught (<85): {pct([r['score'] < 85 for r in bad])}   of errors that reached the translation: {pct([r['score'] < 85 for r in reached])}   flagged likely off (<65): {pct([r['score'] < 65 for r in bad])}")
print(f"errors shown as 'meaning kept' (the dangerous case): {sum(r['score'] >= 85 for r in bad)} of {len(bad)}")
for key in ["domain", "error"]:
    print(f"\nby {key}:  caught / of reached / false alarms")
    for v in sorted({r[key] for r in rows}):
        b = [r for r in bad if r[key] == v]; rb = [r for r in reached if r[key] == v]; g = [r for r in good if r[key] == v]
        print(f"  {v:10} {pct([r['score'] < 85 for r in b]):>7} / {pct([r['score'] < 85 for r in rb]):>7} / {pct([r['score'] < 65 for r in g]):>6}")
print("\nby language: caught / false alarms")
for l in sorted({r["lang"] for r in rows}):
    print(f"  {l} {pct([r['score'] < 85 for r in bad if r['lang'] == l]):>7} / {pct([r['score'] < 65 for r in good if r['lang'] == l]):>6}")
print("\nby domain × error (caught):")
for d in sorted({r["domain"] for r in rows}):
    print(f"  {d}: " + ", ".join(f"{e} {pct([r['score'] < 85 for r in bad if r['domain'] == d and r['error'] == e])}" for e in sorted({r['error'] for r in rows})))
