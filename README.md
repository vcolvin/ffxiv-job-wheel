# FFXIV Job Wheel

A spinning wheel that picks a random FFXIV job. Filter by Tank, Healer, All DPS, or each DPS type, rearrange the slices in any order, and leave out specific jobs.

## Run it

- **Windows:** `dist/FFXIV-Job-Wheel-1.1.2-portable.exe` runs with no install. `...-setup.exe` installs it with a Start menu shortcut.
- **macOS:** open `dist/FFXIV-Job-Wheel-1.1.2-mac.dmg` and drag the app to Applications. It is unsigned, so the first time, right-click the app and choose **Open**.
- **Any browser:** open `src/index.html`.

Windows SmartScreen may warn about an unknown publisher. Click **More info → Run anyway**.

## Develop

```
npm install
npm start          # run in a window
npm run dist:win   # build the Windows .exe files
npm run dist:mac   # build the macOS .dmg/.zip (must be run on a Mac)
```

The job list is in `src/jobs.js`. The display font is Marcellus SC (SIL Open Font License), bundled in `src/fonts/`. The job icons in `src/icons/` come from the FFXIV Glow Job Icons set. Physical ranged glows are hue-shifted toward orange and magical ranged toward purple.
