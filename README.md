# Tetorica VSU Synth for Desktop

A Tauri app for the Virtual Sound Unit from Nintendo’s Virtual Boy. Play the six VSU channels, edit waveforms, inspect VGM playback, and run JavaScript performances. The app bundles the same frontend, WASM audio core, and Web Audio worklet as the [web synth](https://kyorohiro.github.io/hello_ymfm_wasm/synth-vsu/).

## Run and build

Use Node.js 22, Python 3.11 or newer, Rust, and the Tauri 2 platform build tools.

```sh
npm ci
npm test
npm run dev
```

The app runs offline. Exporting a Cassette opens the operating system’s save dialog.

Build with `npm run build -- --bundles app,dmg` on macOS, `npm run build -- --bundles nsis` on Windows, or `npm run build -- --bundles deb,appimage` on Linux. The Build Desktop workflow builds installers for Apple silicon and Intel macOS, x64 Windows, and x64 and ARM64 Linux.

## Update the bundled web app

```sh
npm run import:release -- /path/to/tetorica-vsu-synth-html.zip --version 0.1.0
npm test
```

The import validates the archive, replaces `dist/`, and records its file hashes in `release.lock.json`. `--version` updates the desktop metadata and lockfiles together. Commit `dist/` and `release.lock.json` together. Use `npm run record:edits` to record a deliberate change to the bundled web files.

The readable web frontend is under `dist/synth-vsu/`. Tauri installs the save dialog bridge at runtime. The separate VSU source ZIP contains the C++ sound core and WASM build recipe.
