# Turns results.json into the markdown tables for docs/MEANING-CHECK-TESTS.md.
import json, statistics as st
R = json.load(open('results.json'))
NAMES = {'vie_Latn':'Vietnamese','jpn_Jpan':'Japanese','kor_Hang':'Korean','zho_Hans':'Chinese (simplified)','spa_Latn':'Spanish','arb_Arab':'Arabic','hin_Deva':'Hindi','fra_Latn':'French','tgl_Latn':'Tagalog','por_Latn':'Portuguese','urd_Arab':'Urdu'}
langs = list(dict.fromkeys(r['lang'] for r in R))
pct = lambda xs: f"{round(100*sum(xs)/len(xs))}%" if xs else '–'
good = lambda r: r['kind'].startswith('good')
def row(rs):
    g = [r for r in rs if good(r)]; b = [r for r in rs if r['kind']=='bad']
    return {
      'good_high': pct([r['score']>=85 for r in g]),          # good translations shown as "meaning kept"
      'good_low':  pct([r['score']<65 for r in g]),           # good translations flagged "likely off" (false alarm)
      'bad_caught':pct([r['score']<85 for r in b]),           # bad ones NOT shown as "meaning kept"
      'bad_low':   pct([r['score']<65 for r in b]),           # bad ones flagged "likely off"
      'bad_missed':pct([r['score']>=85 for r in b]),          # bad ones shown as "meaning kept" (miss)
      'good_med': round(st.median([r['score'] for r in g])) if g else '-',
      'bad_med':  round(st.median([r['score'] for r in b])) if b else '-',
    }
print(f"pairs: {len(R)}  good: {sum(good(r) for r in R)}  bad: {sum(r['kind']=='bad' for r in R)}\n")
print("| Language | Good shown as \"meaning kept\" (85+) | Good flagged \"likely off\" (<65) | Bad not shown as kept (<85) | Bad flagged \"likely off\" (<65) | Bad missed (85+) |")
print("|---|---|---|---|---|---|")
for l in langs + ['ALL']:
    rs = R if l=='ALL' else [r for r in R if r['lang']==l]
    x = row(rs); n = '**All 11**' if l=='ALL' else NAMES[l]
    print(f"| {n} | {x['good_high']} | {x['good_low']} | {x['bad_caught']} | {x['bad_low']} | {x['bad_missed']} |")
print("\n| Planted error | Caught (<85) | Flagged \"likely off\" (<65) | Missed (85+) | Median score |")
print("|---|---|---|---|---|")
for e in dict.fromkeys(r['error'] for r in R):
    b = [r for r in R if r['kind']=='bad' and r['error']==e]
    print(f"| {e} | {pct([r['score']<85 for r in b])} | {pct([r['score']<65 for r in b])} | {pct([r['score']>=85 for r in b])} | {round(st.median([r['score'] for r in b]))} |")
print("\n| Good translation source | Shown as kept (85+) | Flagged \"likely off\" (<65) | Median |")
print("|---|---|---|---|")
for k in ['good: professional','good: Google']:
    g = [r for r in R if r['kind']==k]
    print(f"| {k[6:]} | {pct([r['score']>=85 for r in g])} | {pct([r['score']<65 for r in g])} | {round(st.median([r['score'] for r in g]))} |")
# examples of misses and false alarms
print("\nMISSES (bad, scored 85+), sample:")
for r in [r for r in R if r['kind']=='bad' and r['score']>=85][:8]:
    print(f"- [{NAMES[r['lang']]}, {r['error']}, {r['score']}] said: {r['bad_en']!r} | back: {r['back']!r} | meant: {r['en']!r}")
print("\nFALSE ALARMS (good, scored <65), sample:")
for r in [r for r in R if good(r) and r['score']<65][:6]:
    print(f"- [{NAMES[r['lang']]}, {r['kind']}, {r['score']}] meant: {r['en']!r} | back: {r['back']!r}")
