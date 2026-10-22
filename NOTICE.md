# Third-party notices

openGym — Copyright (C) 2026 Duarte Santos.
openGym's own code is licensed under the **GNU AGPL v3.0** (see [LICENSE](LICENSE)).

## App store exception

As an additional permission under section 7 of the AGPL v3.0, the copyright holder permits
distribution of the openGym mobile application through app store platforms (such as the
Apple App Store and Google Play) whose terms of service would otherwise be incompatible
with the AGPL, provided the corresponding source code remains available under the AGPL at
the project repository. This permission applies to the distribution channel only and does
not otherwise limit the license.

## Body diagram geometry

The muscle outlines the body maps are drawn from (`frontend/src/lib/body-paths.js`) are derived
from [**MuscleMap**](https://github.com/melihcolpan/MuscleMap) by Melih Colpan, used under the
**MIT License** and reproduced below. MuscleMap ships its path data as Swift source rather than
`.svg` files; the paths were converted to a JSON module, its sub-group shapes were dropped, and
nothing else about the artwork was changed.

```
MIT License

Copyright (c) 2026 Melih Colpan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Exercise media (stills and animations)

The exercise stills and animations in `catalogue/media/` (and inside the published container
images and app packages) are licensed to openGym by Gym visual. **They are not covered by
openGym's AGPL** and not by any licence of the exercise text below.

> © Aliaksandr Makatserchyk, Gym visual, gymvisual.com (reuse is governed by Gym visual's Terms & Conditions; obtain your own license there before reusing the media). NOTICE TO DEVELOPERS: The exercise animations included in this project are provided strictly for use within the openGym application. Third parties have no rights to reuse, extract, or integrate these media assets into independent apps, websites, or commercial products. To use these animations for your own software, you must obtain a license directly from gymvisual.com.

What that means in practice:

- The repository, websites and self-hosted servers carry the media at 180×180 px at most. Larger
  versions exist only inside the compiled openGym app packages.
- There is no public API, CDN or downloadable media pack. Don't hotlink the files or copy them out
  of this repository or a running instance.
- A non-commercial fork of openGym may keep the unmodified 180 px media together with this notice.
  A commercial fork, or any other use, needs its own licence from [gymvisual.com](https://gymvisual.com/).
- The media may not be used to train, prompt or feed any AI system, or as a basis for generated
  images, animations or video.

## Exercise text (names, muscles, descriptions, instructions)

The catalogue in `catalogue/` is openGym's own and is edited by its community (see
`catalogue/README.md`). Entries marked `"textSource": "exercisedb"` (the 1,324 exercises openGym
shipped before v1.4.0) keep names, muscles and instructions that originate from
[**ExerciseDB v1**](https://exercisedb.dev/) by AscendAPI and reached openGym through
[**hasaneyldrm/exercises-dataset**](https://github.com/hasaneyldrm/exercises-dataset), under the MIT
licence reproduced below. Everything else in the catalogue (the newer exercises, every description,
the muscle-map corrections and all translations) was written for openGym and is covered by
openGym's AGPL.

```
MIT License

Copyright (c) 2026 Hasan Emir Yıldırım

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation and data files (the "Software"),
to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Brazilian Portuguese exercise instructions and names (now in `catalogue/i18n/pt-BR.json`) are original translations of that
English source produced with OpenAI Codex and Anthropic Claude Code
language-model assistance. They are not copied from a separate Portuguese
dataset. Their review status and translation policy are documented alongside
the source files.

## Workout music

The built-in workout playlist is third-party music under **Creative Commons** licences (CC0 1.0,
CC BY 3.0 or CC BY 4.0). **It is not covered by openGym's AGPL.** The audio files are not in this
repository: `scripts/music/fetch-music.mjs` downloads them at build time from each track's
original host, checks them against the SHA-256 recorded in
[`catalogue/music/manifest.json`](catalogue/music/manifest.json), and writes the attribution file
(`attribution.txt`) that ships beside them. The manifest is the source of truth for every title,
artist, licence, source page and attribution string; the list below mirrors it.

Policy: only CC0 and CC BY (no NonCommercial, NoDerivatives or ShareAlike terms), and **no
AI-generated music**. Every track is human-made; each manifest entry records `"ai": false` as an
explicit attestation, and the fetch script refuses any entry without it. Licences were read on
each track's own page before it was added.

| Track | Artist | Licence | Source |
|---|---|---|---|
| Shiny Tech | Kevin MacLeod (incompetech.com) | CC BY 4.0 | incompetech.com |
| Raving Energy (faster) | Kevin MacLeod (incompetech.com) | CC BY 4.0 | incompetech.com |
| Eighties Action | Kevin MacLeod (incompetech.com) | CC BY 4.0 | incompetech.com |
| Ouroboros | Kevin MacLeod (incompetech.com) | CC BY 4.0 | incompetech.com |
| Exit the Premises | Kevin MacLeod (incompetech.com) | CC BY 4.0 | incompetech.com |
| Laserpack | Kevin MacLeod (incompetech.com) | CC BY 4.0 | incompetech.com |
| Motivator | Kevin MacLeod (incompetech.com) | CC BY 4.0 | incompetech.com |
| Breakdown | Kevin MacLeod (incompetech.com) | CC BY 4.0 | incompetech.com |
| Analog By Nature - Are You Ready | AnalogByNature | CC BY 3.0 | ccmixter.org |
| Game | Play House | CC0 1.0 | freemusicarchive.org |
| Propulsion | Musca | CC BY 4.0 | freemusicarchive.org |
| VANISHING POINT (dance, deep, focused, determined) | Soularflair | CC BY 4.0 | freemusicarchive.org |

Licence texts: <https://creativecommons.org/licenses/by/4.0/>,
<https://creativecommons.org/licenses/by/3.0/>, <https://creativecommons.org/publicdomain/zero/1.0/>.
The tracks are used unmodified (an optional build step may re-encode them to AAC, which changes
the file format only).

**If you redistribute openGym with the music** (a fork, a container image, an app package), the
CC BY terms apply to you: keep each track's attribution (title, artist, licence and a link to it)
with the files — `attribution.txt` and this notice — and visible wherever the music is presented.
The CC0 track needs no attribution; it is credited as a courtesy.

## Gym check-in QR codes

The gym check-in feature (a saved membership code shown as a QR code on the phone, added by
typing, importing a photo, or scanning with the camera) uses three third-party packages. All are
permissively licensed and compatible with openGym's AGPL, and all load on demand: the QR renderer
and the browser decoder only when a card is shown or scanned, the ML Kit plugin only in the
Android/iOS app.

### QR/barcode rendering — `lean-qr`

openGym renders each saved code on the phone with [**lean-qr**](https://github.com/davidje13/lean-qr)
by David Evans, used under the **MIT License** and reproduced below. Only the code's stored value
is kept; the picture is generated fresh from that value each time it is shown, never stored.
It runs the same way in the app and in the browser/PWA.

```
MIT License

Copyright (c) 2021-2025 David Evans

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Camera scan & photo decode in the browser — `jsQR`

In a browser (including the installed PWA), reading a code from the camera or from an imported
photo uses [**jsQR**](https://github.com/cozmo/jsQR) by Cosmo Wolfe, under the **Apache License
2.0** (text at <https://www.apache.org/licenses/LICENSE-2.0> and in the package's own `LICENSE`).
Where the browser has a native `BarcodeDetector`, that is tried first and jsQR is the fallback.
Video frames are decoded in memory and never uploaded or stored.

### Camera scan & photo decode in the app — `@capacitor-mlkit/barcode-scanning`

In the Android/iOS app, reading a code — from the camera or from an imported photo — uses the
[**@capacitor-mlkit/barcode-scanning**](https://github.com/capawesome-team/capacitor-mlkit) plugin
by the Capawesome Team (Robin Genz), a Capacitor wrapper around Google's ML Kit, used under the
**Apache License 2.0**. openGym pins the `7.x` line to stay on Capacitor 7. The full license text is
available at <https://www.apache.org/licenses/LICENSE-2.0> and in the package's own `LICENSE` file.
The decoded string is what openGym keeps; the photo itself is never stored.
