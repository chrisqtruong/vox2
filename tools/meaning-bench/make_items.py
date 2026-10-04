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

# --- v2 (2026-10-03, run 2): adds a held-out set ---------------------------------------------
# items-v2.json = the 40 sentences above (split "dev": used while designing the checks) plus 80
# new ones, 16 per error type, picked with a different seed and never looked at while tuning
# (split "test": the headline numbers come from these). Run with:  python3 make_items.py v2
import sys
if len(sys.argv) > 1 and sys.argv[1] == 'v2':
    dev_ids = {it['id'] for it in items}
    for it in items: it['split'] = 'dev'
    random.seed(2026)
    idx2 = list(range(len(eng))); random.shuffle(idx2)
    used2 = set(dev_ids); test = []
    for kind, fn in RULES:
        got = 0
        for i in idx2:
            if i in used2 or not (40 <= len(eng[i]) <= 220): continue
            bad = fn(eng[i])
            if bad and bad != eng[i]:
                test.append({'id': i, 'kind': kind, 'en': eng[i], 'bad_en': bad, 'split': 'test', 'refs': {c: refs[c][i] for c in L}}); used2.add(i); got += 1
                if got == 16: break
    json.dump({'langs': L, 'items': items + test}, open('items-v2.json','w'), ensure_ascii=False, indent=1)
    print(len(items), 'development +', len(test), 'held-out sentences')

# --- v3 (2026-10-03, run 3): a fresh held-out set ---------------------------------------------
# Run 2's held-out examples were looked at while writing its report, so run 3 uses 80 new
# sentences (seed 2027), none from run 1 or run 2, plus the same 40 development sentences.
# Run with:  python3 make_items.py v3
if len(sys.argv) > 1 and sys.argv[1] == 'v3':
    v2 = json.load(open('items-v2.json'))
    seen = {it['id'] for it in v2['items']}
    dev = [dict(it, split='dev') for it in items]
    random.seed(2027)
    idx3 = list(range(len(eng))); random.shuffle(idx3)
    test3 = []
    for kind, fn in RULES:
        got = 0
        for i in idx3:
            if i in seen or not (40 <= len(eng[i]) <= 220): continue
            bad = fn(eng[i])
            if bad and bad != eng[i]:
                test3.append({'id': i, 'kind': kind, 'en': eng[i], 'bad_en': bad, 'split': 'test', 'refs': {c: refs[c][i] for c in L}}); seen.add(i); got += 1
                if got == 16: break
    json.dump({'langs': L, 'items': dev + test3}, open('items-v3.json','w'), ensure_ascii=False, indent=1)
    print(len(dev), 'development +', len(test3), 'fresh held-out sentences')

# --- v4 (2026-10-04, run 5): fresh held-out set + a "gender added" error type -----------------
# Runs 2-3's held-out sentences were read while designing Phase 1.2, so run 5 uses 80 new ones
# (seed 2028, none used in runs 1-3), 16 per error type, plus 16 for a new error type: a gender
# the sentence doesn't state ("they" -> "he", "people" -> "men", "parent" -> "mother"), which the
# inclusive pronoun check (Phase 1.2) is meant to catch. Same 40 development sentences.
# Run with:  python3 make_items.py v4
GENDER_ADD = [(r'\bthey\b', 'he'), (r'\bThey\b', 'He'), (r'\bthem\b', 'him'), (r'\btheir\b', 'his'), (r'\bTheir\b', 'His'),
              (r'\bpeople\b', 'men'), (r'\bPeople\b', 'Men'), (r'\bperson\b', 'man'), (r'\bchildren\b', 'sons'), (r'\bchild\b', 'son'),
              (r'\bparents\b', 'mothers'), (r'\bparent\b', 'mother'), (r'\bspouse\b', 'wife'), (r'\bpartner\b', 'husband'),
              (r'\bsiblings\b', 'brothers'), (r'\bfriends\b', 'girlfriends')]
AGREE = {'are': 'is', 'were': 'was', 'have': 'has', 'do': 'does', "don't": "doesn't", "aren't": "isn't", "weren't": "wasn't"}
def gender_add(s):
    if re.search(r'\b(he|she|him|her|his|hers|man|men|woman|women)\b', s, re.I): return None  # already gendered
    for a, b in GENDER_ADD:
        m = re.search(a + r'(\s+)(\S+)', s)
        if not m: continue
        nxt = m.group(2)
        if b.lower() == 'he':  # keep the verb agreeing: "they are" -> "he is"; skip a bare present verb ("they talk")
            if nxt in AGREE: return s[:m.start()] + b + m.group(1) + AGREE[nxt] + s[m.end():]
            if not re.fullmatch(r"(?:would|could|will|can|should|might|must|may|had|\w+ed|\w+'d),?", nxt): continue
        return re.sub(a, b, s, count=1)
if len(sys.argv) > 1 and sys.argv[1] == 'v4':
    seen = {it['id'] for f in ['items-v2.json', 'items-v3.json'] for it in json.load(open(f))['items']}
    dev = [dict(it, split='dev') for it in items]
    random.seed(2028)
    idx4 = list(range(len(eng))); random.shuffle(idx4)
    test4 = []
    for kind, fn in RULES + [('gender added', gender_add)]:
        got = 0
        for i in idx4:
            if i in seen or not (40 <= len(eng[i]) <= 220): continue
            bad = fn(eng[i])
            if bad and bad != eng[i]:
                test4.append({'id': i, 'kind': kind, 'en': eng[i], 'bad_en': bad, 'split': 'test', 'refs': {c: refs[c][i] for c in L}}); seen.add(i); got += 1
                if got == 16: break
    json.dump({'langs': L, 'items': dev + test4}, open('items-v4.json','w'), ensure_ascii=False, indent=1)
    print(len(dev), 'development +', len(test4), 'fresh held-out sentences')
