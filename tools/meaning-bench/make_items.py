# Builds items.json: 40 English sentences from FLORES-200 (dev split), each with one planted
# meaning error, plus the professional translations into the test languages.
# Usage: download https://dl.fbaipublicfiles.com/nllb/flores200_dataset.tar.gz, extract it here,
# then run: python3 make_items.py   (fixed seed, so the same sentences come out every time)
import json, re, random
L = ['vie_Latn','jpn_Jpan','kor_Hang','zho_Hans','spa_Latn','arb_Arab','hin_Deva','fra_Latn','tgl_Latn','por_Latn','urd_Arab']
rd = lambda c: open(f'flores200_dataset/dev/{c}.dev', encoding='utf-8').read().splitlines()
eng = rd('eng_Latn'); refs = {c: rd(c) for c in L}

def negate(s):
    for a, b in [(r'\bis not\b','is'),(r'\bare not\b','are'),(r'\bwas not\b','was'),(r'\bwere not\b','were'),(r'\bcannot\b','can'),(r'\bdoes not\b','does'),(r'\bdid not\b','did'),(r'\bwill not\b','will')]:
        if re.search(a, s): return re.sub(a, b, s, count=1)
    for a, b in [(r'\bis\b','is not'),(r'\bare\b','are not'),(r'\bwas\b','was not'),(r'\bwere\b','were not'),(r'\bcan\b','cannot'),(r'\bwill\b','will not'),(r'\bhas been\b','has not been'),(r'\bhave been\b','have not been')]:
        if re.search(a, s): return re.sub(a, b, s, count=1)
def number(s):
    m = re.search(r'\b(\d{1,4})\b', s)
    if not m: return None
    n = int(m.group(1)); new = str(n*3+7 if n < 1900 or n > 2100 else n-23)
    return s[:m.start()] + new + s[m.end():]
def pronoun(s):
    pairs = {'he':'she','she':'he','his':'her','him':'her','He':'She','She':'He','His':'Her','Him':'Her'}
    m = re.search(r'\b(he|she|his|him|He|She|His|Him)\b', s)
    if not m: return None
    return s[:m.start()] + pairs[m.group(1)] + s[m.end():]
ANT = [('left','right'),('right','left'),('before','after'),('after','before'),('more','less'),('increase','decrease'),('increased','decreased'),('higher','lower'),('lower','higher'),('largest','smallest'),('first','last'),('early','late'),('north','south'),('south','north'),('east','west'),('west','east'),('always','never'),('many','few'),('win','lose'),('won','lost'),('lost','won'),('open','closed'),('hot','cold'),('large','small'),('old','new'),('new','old')]
def opposite(s):
    for a, b in ANT:
        if re.search(rf'\b{a}\b', s): return re.sub(rf'\b{a}\b', b, s, count=1)
def drop(s):
    parts = re.split(r',\s+(?:and|but|which|while|although|because)\s+|;\s+', s, maxsplit=1)
    if len(parts) == 2 and len(parts[0].split()) >= 6 and len(parts[1].split()) >= 4:
        return parts[0].rstrip(',;') + '.'
RULES = [('negation', negate), ('number', number), ('pronoun', pronoun), ('opposite', opposite), ('dropped clause', drop)]
random.seed(7)
idx = list(range(len(eng))); random.shuffle(idx)
used = set(); items = []
for kind, fn in RULES:
    got = 0
    for i in idx:
        if i in used or not (40 <= len(eng[i]) <= 220): continue
        bad = fn(eng[i])
        if bad and bad != eng[i]:
            items.append({'id': i, 'kind': kind, 'en': eng[i], 'bad_en': bad}); used.add(i); got += 1
            if got == 8: break
for it in items: it['refs'] = {c: refs[c][it['id']] for c in L}
json.dump({'langs': L, 'items': items}, open('items.json','w'), ensure_ascii=False, indent=1)
print(len(items), 'sentences ×', len(L), 'languages')
