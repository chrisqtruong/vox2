# Builds items-untranslated.json: text Google can't translate, for the "wasn't translated" check
# (#38). Google passes what it can't translate through unchanged both ways, so the ↩ line repeats
# your text and the match score says 100% when nothing was checked.
#
# Base sentences: the English sentences already in items-v3.json (development set → "dev",
# held-out set → "test"), so no new download is needed. Each base sentence gets:
#   garbled all   every word mangled the way a bad screen capture reads (rn→m, l→I, dropped
#                 letters…), the case from the issue
#   garbled half  one half of the sentence mangled, the other half fine
#   made-up       about 40% of the longer words swapped for invented words
#   gibberish     random letter runs and numbers, like OCR of an image with no text
# Should NOT be flagged ("names"): hand-written sentences full of names and brand words that
# translations keep as they are (Bento, Aurora, Nautilus). The good translations from runs 1–3
# are the main false-alarm check (2,640 translations with many FLORES names).
# Usage: python3 make_untranslated.py   (fixed seed)
import json, random, re

random.seed(38)
v3 = json.load(open('items-v3.json'))
CONFUSE = [('rn', 'm'), ('m', 'rn'), ('l', 'I'), ('I', 'l'), ('e', 'c'), ('c', 'e'), ('a', 'o'), ('o', 'a'), ('h', 'b'),
           ('n', 'h'), ('u', 'v'), ('i', 'l'), ('t', 'f'), ('cl', 'd'), ('d', 'cl'), ('w', 'vv'), ('s', 'z')]

def mangle(w):
    if not re.search('[A-Za-z]', w):
        return w
    for _ in range(random.randint(1, 3)):
        op = random.random()
        if op < 0.45:
            pairs = [p for p in CONFUSE if p[0] in w]
            if pairs:
                a, b = random.choice(pairs)
                i = random.choice([m.start() for m in re.finditer(re.escape(a), w)])
                w = w[:i] + b + w[i + len(a):]
        elif op < 0.7 and len(w) > 3:
            i = random.randrange(1, len(w) - 1)
            w = w[:i] + w[i + 1:]  # dropped letter
        elif op < 0.85:
            i = random.randrange(len(w) + 1)
            w = w[:i] + random.choice('aeilnorstu') + w[i:]
        elif len(w) > 4:
            w = w[: random.randint(2, len(w) - 2)]  # cut short
    return w

def garble(s, part='all'):
    ws = s.split()
    if part == 'all':
        rng = range(len(ws))
    else:
        h = len(ws) // 2
        rng = range(h) if random.random() < 0.5 else range(h, len(ws))
    return ' '.join(mangle(w) if i in rng else w for i, w in enumerate(ws))

V, C = 'aeiou', 'bcdfghjklmnprstvwz'
def pseudo():
    return ''.join(random.choice(C) + random.choice(V) for _ in range(random.randint(2, 3))) + random.choice(['n', 'sh', 'le', 'x', 'rt', ''])

def made_up(s):
    ws = s.split()
    long = [i for i, w in enumerate(ws) if re.fullmatch(r'[a-z]{5,}[,.]?', w)]
    for i in random.sample(long, max(1, round(len(long) * 0.4))) if long else []:
        tail = ws[i][-1] if ws[i][-1] in ',.' else ''
        ws[i] = pseudo() + tail
    return ' '.join(ws)

def gibberish():
    out = []
    for _ in range(random.randint(6, 14)):
        r = random.random()
        if r < 0.15:
            out.append(str(random.randint(0, 99999)))
        else:
            w = ''.join(random.choice('abcdefghijklmnopqrstuvwxyz') for _ in range(random.randint(1, 5)))
            out.append(w.capitalize() if random.random() < 0.35 else w)
    return ' '.join(out)

NAMES = [
    'Open Bento and Aurora on the Nautilus before lunch.',
    'I bought a Nautilus subscription for my sister.',
    'Can you send the Figma file to Priya before the meeting?',
    'We watched Parasite on Netflix with Minh and Sarah last night.',
    'The Aurora update for Bento ships on Tuesday.',
    'My cousin works at Accenture in Houston.',
    'Download Spotify and search for Phương Mỹ Chi.',
    'Ask Grandma Lan if she wants to visit Baltimore in the spring.',
    'The Nautilus app crashed again when I opened Bento.',
    'Ryan Gosling and Emma Stone starred in La La Land.',
    'I left my iPhone charger at the Hilton near Union Station.',
    'Kendrick Lamar and SZA are playing at Capital One Arena.',
    'Use Slack or Microsoft Teams to message Dr. Nguyen.',
    'The Patagonia jacket is on sale at REI this weekend.',
    'Order the bánh mì from Pho Saigon on Bellaire Boulevard.',
    'We flew Southwest from Hobby Airport to Philadelphia.',
    'Grace Hopper wrote the first compiler for the UNIVAC.',
    'Tell Kevin that the Tesla Model Y needs new tires.',
    'The Intercept and Al Jazeera both covered the story.',
    'Please install Zoom, Notion and Obsidian on the new MacBook.',
    'Bento, Aurora and Nautilus are all made by Starlight Labs.',
    'Professor Okonkwo teaches at Johns Hopkins.',
    'My favorite album is Blonde by Frank Ocean.',
    'Did you see the new Pixar movie at the AMC in Towson?',
    'The Trader Joe’s on Charles Street opens at nine.',
    'Linh uses Duolingo and Anki to study Korean.',
    'We are meeting at Blue Bottle Coffee near Rittenhouse Square.',
    'Microsoft Excel and Google Sheets can both open CSV files.',
    'The Golden Gate Bridge is in San Francisco.',
    'Marcus, Aaliyah and Tomás joined the GitHub organization.',
]

items = []
for it in v3['items']:
    split = it['split']
    for kind, text in [('garbled all', garble(it['en'])), ('garbled half', garble(it['en'], 'half')),
                       ('made-up', made_up(it['en'])), ('gibberish', gibberish())]:
        items.append({'id': it['id'], 'split': split, 'kind': kind, 'en': it['en'], 'text': text})
for i, s in enumerate(NAMES):
    items.append({'id': 10000 + i, 'split': 'dev' if i % 3 == 0 else 'test', 'kind': 'names', 'en': s, 'text': s})
json.dump({'langs': v3['langs'], 'items': items}, open('items-untranslated.json', 'w'), ensure_ascii=False, indent=1)
print(len(items), 'items:', {k: sum(1 for x in items if x['kind'] == k) for k in sorted({x['kind'] for x in items})})
