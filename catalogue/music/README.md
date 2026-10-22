# Workout music

`manifest.json` lists the royalty-free tracks of the built-in workout playlist. The audio itself is
never committed: `scripts/music/fetch-music.mjs` downloads it at build time into `files/`
(gitignored). Licences and the attribution list: [NOTICE.md](../../NOTICE.md#workout-music).

## Fetching

    node scripts/music/fetch-music.mjs            # download + verify against the pinned sha256
    node scripts/music/fetch-music.mjs --check    # validate the manifest only (what CI runs)
    node scripts/music/fetch-music.mjs --encode   # also make <id>.m4a (AAC 96k); needs ffmpeg, skipped without it

Output in `files/`: `<id>.mp3`, `index.json` (what the app reads) and `attribution.txt`.

## Adding a track

Open an issue or pull request with one new entry in `manifest.json`. Before adding it, check:

1. **Licence read on the track's own page**: CC0 1.0, CC BY 3.0 or CC BY 4.0 only. No NC, ND or SA,
   no "free for YouTube" or custom licences.
2. **Human-made, not AI-generated.** Skip anything tagged or described as AI, or from an AI-music
   site. Set `"ai": false` only once you have checked; the script refuses the entry otherwise.
3. **Directly downloadable** without a login (a redirect is fine; never paste the redirected,
   hashed file URL). If the host needs a Referer, set `"fetch": { "referer": "…" }`.
4. **Attribution string** exactly as the licensor asks (empty for CC0), containing the artist.
5. `verifiedOn` (today) and `verifiedBy` ("licence read on the source page"); `sha256` and `bytes`
   `null`.

Then run `node scripts/music/fetch-music.mjs --pin --only <id>`. It downloads the file, checks it is
really an MP3 and writes `sha256`/`bytes` into the manifest. Commit the manifest.

If a pinned file ever stops matching, the upstream file changed: re-check the licence, set
`sha256`/`bytes` back to `null` and pin again.
