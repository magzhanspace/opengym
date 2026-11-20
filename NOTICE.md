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

## QR codes

The device-link and server-address QR codes are drawn with one third-party package, loaded on
demand. (The gym check-in feature these notes used to describe, with its jsQR and ML Kit
scanners, has been removed from this fork.)

### QR rendering — `lean-qr`

openGym renders its QR codes with [**lean-qr**](https://github.com/davidje13/lean-qr)
by David Evans, used under the **MIT License** and reproduced below. It runs the same way in the app and
in the browser/PWA.

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

## Garmin watches: the Connect IQ Mobile SDK

The phone's link to the openGym Garmin watch app (docs/GARMIN.md) uses Garmin's **Connect IQ
Mobile SDK**: on Android `com.garmin.connectiq:ciq-companion-app-sdk` (Maven Central), on the
iPhone the `ConnectIQ.xcframework` Swift package from
<https://github.com/garmin/connectiq-companion-app-sdk-ios>. It is **not open source**: Garmin
licenses it under the *Garmin Connect IQ SDK License Agreement* and the *Connect IQ Application
Developer Agreement* (<https://developer.garmin.com/connect-iq/sdk/>). openGym's repository does not
contain it; the build fetches it.

It is only in the builds that already carry other closed platform code: the GitHub APK and the
Google Play build (beside Google Play services' Wearable Data Layer) and the App Store build. The
F-Droid build leaves it out (`app/build.gradle`, checked by `scripts/android/check-fdroid.sh`), and
there the Garmin page says the link is not in that build. openGym's own Garmin code
(`frontend/garmin`, `GarminLink`, `GarminMessages`) stays AGPL.

As an additional permission under section 7 of the AGPL v3.0, the copyright holder permits
conveying the openGym mobile application, and works based on it, combined or linked with the
Garmin Connect IQ Mobile SDK and with closed platform libraries the operating system or its app
store requires for a feature (such as Google Play services' Wearable Data Layer or Apple's
system frameworks), without the Corresponding Source of those libraries. Everything else stays
under the AGPL: openGym's own source, including the code that talks to these libraries, must
remain available as the license requires.
