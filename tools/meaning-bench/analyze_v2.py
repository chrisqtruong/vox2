# Before/after tables for a run that records both scores (scoreRun1 = run-1 method, score = current).
# Usage: python3 analyze_v2.py results-v2.json
import json, sys, statistics as st
R = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'results-v2.json'))
NAMES = {'vie_Latn':'Vietnamese','jpn_Jpan':'Japanese','kor_Hang':'Korean','zho_Hans':'Chinese (simplified)','spa_Latn':'Spanish','arb_Arab':'Arabic','hin_Deva':'Hindi','fra_Latn':'French','tgl_Latn':'Tagalog','por_Latn':'Portuguese','urd_Arab':'Urdu'}
ERRS = ['negation','number','pronoun','opposite','dropped clause']
pc = lambda xs: round(100*sum(xs)/len(xs)) if xs else None
isgood = lambda r: r['kind'].startswith('good')
def m(rs, key):
    g = [r for r in rs if isgood(r)]; b = [r for r in rs if not isgood(r)]
    return dict(kept=pc([r[key]>=85 for r in g]), fa=pc([r[key]<65 for r in g]), caught=pc([r[key]<85 for r in b]), flagged=pc([r[key]<65 for r in b]), missed=pc([r[key]>=85 for r in b]), n_good=len(g), n_bad=len(b))
for split in ['test','dev']:
    rs = [r for r in R if r['split']==split]
    o, n = m(rs,'scoreRun1'), m(rs,'score')
    print(f"\n### {'Held-out' if split=='test' else 'Development'} set ({len({r['id'] for r in rs})} sentences, {n['n_good']} good + {n['n_bad']} bad pairs)\n")
    print("| Measure | Run-1 method | Phase 1 | Better is |")
    print("|---|---|---|---|")
    for k,label,better in [('kept','Good shown as \"meaning kept\" (85+)','higher'),('fa','False alarms (good below 65)','lower'),('caught','Errors caught (bad below 85)','higher'),('flagged','Errors flagged \"likely off\" (bad below 65)','higher'),('missed','Missed (bad 85+)','lower')]:
        print(f"| {label} | {o[k]}% | **{n[k]}%** | {better} |")
    print("\n| Planted error | Run-1 method caught | Phase 1 caught | Phase 1 missed |")
    print("|---|---|---|---|")
    for e in ERRS:
        b = [r for r in rs if not isgood(r) and r['error']==e]
        print(f"| {e} | {pc([r['scoreRun1']<85 for r in b])}% | **{pc([r['score']<85 for r in b])}%** | {pc([r['score']>=85 for r in b])}% |")
    print("\n| Language | Good kept (run 1 → phase 1) | False alarms | Errors caught |")
    print("|---|---|---|---|")
    for l in NAMES:
        x = [r for r in rs if r['lang']==l]
        if not x: continue
        o, n = m(x,'scoreRun1'), m(x,'score')
        print(f"| {NAMES[l]} | {o['kept']}% → {n['kept']}% | {o['fa']}% → {n['fa']}% | {o['caught']}% → **{n['caught']}%** |")
    # which checks fire
    g = [r for r in rs if isgood(r)]; b = [r for r in rs if not isgood(r)]
    print("\n| Check | Fires on good translations | Fires on bad translations |")
    print("|---|---|---|")
    for c in ['negation','pronoun','opposite','date','missing']:
        print(f"| {c} | {pc([c in r['checks'] for r in g])}% | {pc([c in r['checks'] for r in b])}% |")
    print(f"| number (incl. number words) | {pc([r['numbersDiffer'] for r in g])}% | {pc([r['numbersDiffer'] for r in b])}% |")
print("\nSAMPLE false alarms (held-out, phase 1 below 65, good):")
for r in [r for r in R if r['split']=='test' and isgood(r) and r['score']<65][:8]:
    print(f"- [{NAMES[r['lang']]}, {r['kind']}, {r['score']}, checks={r['checks']}, num={r['numbersDiffer']}] {r['en'][:90]!r} ↩ {r['back'][:90]!r}")
print("\nSAMPLE misses (held-out, phase 1 85+, bad):")
for r in [r for r in R if r['split']=='test' and not isgood(r) and r['score']>=85][:10]:
    print(f"- [{NAMES[r['lang']]}, {r['error']}, {r['score']}] said {r['bad_en'][:90]!r} ↩ {r['back'][:90]!r}")
