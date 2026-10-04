# Tables for the "wasn't translated" checks (#38), from rescore.html's output: the app's check
# (shippedCantCheck, resources/meaning-checks.js) and the two-level variant (untranslated-two-level.js).
# Usage: python3 analyze_untranslated.py untranslated-scored.json [can't-check share] [partial share]
# "Meaning kept" = a score of 85+. Two-level variant: from the first share on there's no score
# ("can't check"); from the second the score is capped at 84.
import json, sys
from collections import defaultdict, Counter
all_rows = json.load(open(sys.argv[1]))
rows = [r for r in all_rows if not r.get('empty')]
U = float(sys.argv[2]) if len(sys.argv) > 2 else 0.4
P = float(sys.argv[3]) if len(sys.argv) > 3 else 0.2
pct = lambda xs: f"{100 * sum(xs) / len(xs):.0f}%" if xs else '–'
kept_after = lambda r: r['scoreBefore'] >= 85 and r['share'] < P
KINDS = ['gibberish', 'garbled all', 'garbled half', 'made-up', 'names']
for split in ['dev', 'test']:
    print(f'\n## {split} (can\'t check from {U:.0%}, capped from {P:.0%})\n')
    print('| Text | n | "Meaning kept" with no check | App\'s check: "meaning kept" | App: "can\'t check" | Two-level: "meaning kept" | Two-level: "can\'t check" | Two-level: capped at 84 |')
    print('|---|---|---|---|---|---|---|---|')
    for k in KINDS:
        g = [r for r in rows if r['split'] == split and r['kind'] == k]
        print(f"| {k} | {len(g)} | {pct([r['scoreBefore'] >= 85 for r in g])} | {pct([r['scoreBefore'] >= 85 and not r['shippedCantCheck'] for r in g])} | "
              f"{pct([r['shippedCantCheck'] for r in g])} | {pct([kept_after(r) for r in g])} | "
              f"{pct([r['share'] >= U for r in g])} | {pct([P <= r['share'] < U for r in g])} |")
    by = defaultdict(list)
    for r in rows:
        if r['split'] == split and r['kind'] != 'names': by[r['lang']].append(r)
    print('\nBy language (all untranslatable kinds), "meaning kept": no check / app\'s check / two-level:')
    print(', '.join(f"{l} {pct([r['scoreBefore'] >= 85 for r in g])} / {pct([r['scoreBefore'] >= 85 and not r['shippedCantCheck'] for r in g])} / {pct([kept_after(r) for r in g])}" for l, g in by.items()))
empty = Counter(f"{r['lang']} {r['kind']}" for r in all_rows if r.get('empty'))
print(f'\nSkipped {sum(empty.values())} rows with an empty translation or ↩ line (the app shows no score for them):', dict(empty))
