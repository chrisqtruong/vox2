# Coin-Op: project expenditure

Where Vox2's Claude tokens go: day by day, bucket by bucket (meaning check, Mac version, bug fixes, releases…), what it would cost at API prices, and how that lines up with the [roadmap](../../README.md#roadmap).

- **Website:** [chrisqtruong.github.io/vox2/expenditure](https://chrisqtruong.github.io/vox2/expenditure/) updates itself (checks every 2 minutes).
- **On your computer:** [localhost:8642](http://localhost:8642) is live, updating every few seconds while you work.

## Set it up once per computer

From the repo folder (Python 3.9+, nothing to install):

```
python3 docs/expenditure/coinop.py --install
```

That's it. Coin-Op now starts when you log in (macOS: a login item via `launchd`; Windows: the Startup folder), keeps localhost:8642 live, and every 5 minutes pushes that computer's totals to the `coin-op-data` branch, which the website reads. It never touches main, so there's nothing to merge and no CI runs.

Each computer writes only its own file on that branch (`machines/<computer>.json`), and the totals add them up, so the Mac and the PC don't overwrite each other. To bring in the PC's Vox2 history, run the same `--install` there.

- Run it once without installing: `python3 docs/expenditure/coinop.py`
- Stop and remove: `python3 docs/expenditure/coinop.py --uninstall`
- Log (macOS): `~/.coin-op/log.txt`. Coin-Op keeps its copy of the data branch in `~/.coin-op/data`.
- Pushing uses that computer's normal git sign-in for GitHub.

## How it counts

- **Which sessions:** Claude Code's transcripts in `~/.claude/projects`. A session counts if it mostly worked in the Vox2 repo, or said "vox2" up front.
- **Buckets:** each turn (your message plus everything Claude did for it) goes into one bucket, by the words in your message and the files Claude touched. Background-task notes and context summaries count toward the turn before them. The word lists are at the top of `coinop.py`; edit them to tune the sorting.
- **Credits:** tokens priced at API list prices (input, output, cache writes, cache reads). On a Claude plan you pay a flat fee, so treat it as a measure of work, not a bill.
- **Roadmap:** read straight from the README's Roadmap section on main (fetched from GitHub, so it's current even if your local copy is behind) (titles, value · effort tags, "Shipped/Started" notes, the Done line). Buckets roll up into the roadmap's themes: *trustworthy* (meaning check), *useful every day* (snip, voice, look and features), *reach* (Mac, signing), plus *upkeep* (bugs, releases, docs, learning) which isn't on the roadmap.
- **Next up:** the first started item (finish what's begun), the best value-for-effort item in the theme that's furthest behind its share of roadmap value, and the best value-for-effort item overall.

## Privacy

What goes up to GitHub is only totals per session, day and bucket, plus the parsed roadmap. Never your prompts. The "recent turns" list with your prompts appears only on the live page on your own computer.
