# Translates items-untranslated.json with Google both ways (same endpoint as Vox2's main
# translation and run.html), so the "wasn't translated" check can be measured offline.
# Usage: python3 fetch_untranslated.py out.json   (resumes per language)
import json, sys, time, subprocess, os
G = {'vie_Latn': 'vi', 'jpn_Jpan': 'ja', 'kor_Hang': 'ko', 'zho_Hans': 'zh-CN', 'spa_Latn': 'es', 'arb_Arab': 'ar', 'hin_Deva': 'hi', 'fra_Latn': 'fr', 'tgl_Latn': 'tl', 'por_Latn': 'pt', 'urd_Arab': 'ur'}
d = json.load(open('items-untranslated.json')); OUT = sys.argv[1]
res = json.load(open(OUT)) if os.path.exists(OUT) else []
done = {r['lang'] for r in res}
def tr(texts, sl, tl):
    out = []
    for i in range(0, len(texts), 15):
        args = sum([['--data-urlencode', 'q=' + t] for t in texts[i:i + 15]], [])
        for tries in range(8):
            try:  # curl: uses the system's certificates
                r = subprocess.run(['curl', '-sf', '--max-time', '30', f'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl={sl}&tl={tl}', *args], capture_output=True, text=True, check=True)
                j = json.loads(r.stdout); out += [x[0] if isinstance(x, list) else x for x in j]; break
            except Exception as e:
                print('retry', e, flush=True); time.sleep(4 * (tries + 1))
        else:
            raise SystemExit('Google kept failing')
        time.sleep(0.7)
    return out
for lang in d['langs']:
    if lang in done: continue
    items = d['items']
    fwd = tr([x['text'] for x in items], 'en', G[lang])
    back = tr(fwd, G[lang], 'en')
    res += [dict(x, lang=lang, translation=f, back=b) for x, f, b in zip(items, fwd, back)]
    json.dump(res, open(OUT, 'w'), ensure_ascii=False)
    print(lang, 'done', flush=True)
print('SAVED', len(res))

# Google sometimes answers a whole batch with empty strings (throttling). Retry empty rows one at a
# time; what's still empty after that is Google's real answer (it returns nothing for some gibberish).
for r in res:
    for tries in range(3):
        if r['translation'].strip() and r['back'].strip(): break
        time.sleep(1.5 * (tries + 1))
        if not r['translation'].strip(): r['translation'] = tr([r['text']], 'en', G[r['lang']])[0]
        if r['translation'].strip(): r['back'] = tr([r['translation']], G[r['lang']], 'en')[0]
json.dump(res, open(OUT, 'w'), ensure_ascii=False)
print('still empty after retries:', sum(1 for r in res if not (r['translation'].strip() and r['back'].strip())))
