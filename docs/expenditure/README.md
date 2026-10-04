# Coin-Op: project expenditure

Where Vox2's Claude tokens go: day by day, bucket by bucket (meaning check, Mac version, bug fixes, releases…), what it would cost at API prices, and how that lines up with the [roadmap](../../README.md#roadmap).

- **Snapshot:** [chrisqtruong.github.io/vox2/expenditure](https://chrisqtruong.github.io/vox2/expenditure/) shows the last saved `data.json`.
- **Live:** run it on your computer and it updates every few seconds while you work.

## Run it

From the repo folder (Python 3.9+, nothing to install):

```
python3 docs/expenditure/coinop.py              # live page at http://localhost:8642
python3 docs/expenditure/coinop.py --snapshot   # refresh data.json for the website, then commit it
```

To include sessions from another computer, copy that computer's `~/.claude/projects` folder over and add `--projects <that folder>`.

## How it counts

- **Which sessions:** Claude Code's transcripts in `~/.claude/projects`. A session counts if it mostly worked in the Vox2 repo, or said "vox2" up front.
- **Buckets:** each turn (your message plus everything Claude did for it) goes into one bucket, by the words in your message and the files Claude touched. Background-task notes and context summaries count toward the turn before them. The word lists are at the top of `coinop.py`; edit them to tune the sorting.
- **Credits:** tokens priced at API list prices (input, output, cache writes, cache reads). On a Claude plan you pay a flat fee, so treat it as a measure of work, not a bill.
- **Roadmap:** read straight from the README's Roadmap section (titles, value · effort tags, "Shipped/Started" notes, the Done line). Buckets roll up into the roadmap's themes: *trustworthy* (meaning check), *useful every day* (snip, voice, look and features), *reach* (Mac, signing), plus *upkeep* (bugs, releases, docs, learning) which isn't on the roadmap.
- **Next up:** the first started item (finish what's begun), the best value-for-effort item in the theme that's furthest behind its share of roadmap value, and the best value-for-effort item overall.

## Privacy

Everything runs locally. `data.json` holds only daily totals per bucket and the parsed roadmap, never your prompts. The "recent turns" list with your prompts appears only on the live page on your own computer.
