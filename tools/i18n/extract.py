# Collects every piece of English text the app shows, as i18n.js looks it up:
#   - the pages' own text (index.html, bubble.html, snip.html): text, title, placeholder,
#     aria-label, data-placeholder; whole markup for data-i18n="html"; skipping translate="no"
#   - tr('…') and N_('…') in the code
# Writes strings.json (sorted). Run from anywhere: python3 tools/i18n/extract.py
import json, re, html, pathlib
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parents[2]
RES = ROOT / "resources"
PAGES = ["index.html", "bubble.html", "snip.html"]
ATTRS = {"title", "placeholder", "aria-label", "data-placeholder"}
SKIP_TAGS = {"script", "style", "svg", "textarea", "title"}  # <title>: window names, not shown as text
VOID = {"br", "img", "input", "meta", "link", "hr", "source", "use", "path", "rect", "circle", "symbol"}
norm = lambda s: re.sub(r"\s+", " ", s).strip()
has_letter = lambda s: re.search(r"[^\W\d_]", s) is not None
found = {}

def add(s, where):
    s = norm(s)
    if s and has_letter(s):
        found.setdefault(s, where)

class Page(HTMLParser):
    def __init__(self, name):
        super().__init__(convert_charrefs=True)
        self.name, self.stack = name, []  # stack of (tag, skipping)
    def skipping(self):
        return bool(self.stack) and self.stack[-1][1]
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        skip = self.skipping() or tag in SKIP_TAGS or a.get("translate") == "no" or a.get("data-i18n") == "html"
        if not skip or a.get("data-i18n") == "html":
            if not self.skipping():
                for k in ATTRS & a.keys():
                    add(a[k] or "", f"{self.name} [{k}]")
        if tag not in VOID:
            self.stack.append((tag, skip))
    def handle_startendtag(self, tag, attrs):
        a = dict(attrs)
        if not self.skipping() and a.get("translate") != "no":
            for k in ATTRS & a.keys():
                add(a[k] or "", f"{self.name} [{k}]")
    def handle_endtag(self, tag):
        if tag in VOID:
            return
        while self.stack:
            t, _ = self.stack.pop()
            if t == tag:
                break
    def handle_data(self, data):
        if not self.skipping():
            add(data, self.name)

for name in PAGES:
    src = (RES / name).read_text()
    Page(name).feed(src)
    # Whole-markup strings: the inside of each data-i18n="html" element, as the browser serializes it.
    for m in re.finditer(r'<(\w+)[^>]*data-i18n="html"[^>]*>(.*?)</\1>', src, re.S):
        add(m.group(2), f"{name} [html]")

CALL = re.compile(r"""\b(?:tr|N_)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)""")
unescape = lambda s: re.sub(r"\\(.)", r"\1", s)
for path in sorted(list(RES.glob("*.js")) + [RES / p for p in PAGES]):
    for m in CALL.finditer(path.read_text()):
        add(unescape(next(g for g in m.groups() if g is not None)), path.name)

out = ROOT / "tools" / "i18n" / "strings.json"
out.write_text(json.dumps(dict(sorted(found.items())), ensure_ascii=False, indent=1) + "\n")
print(f"{len(found)} strings → {out.relative_to(ROOT)}")
