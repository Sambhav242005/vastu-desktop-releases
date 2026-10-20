# Vastu Grid for Windows

[Download Windows installers](https://github.com/Sambhav242005/vastu-desktop-releases/releases)

This repo contains the Windows Electron shell, tests, build workflow and compiled
Expo renderer. Android/Expo source stays private; CI does not access that repo.

## Use

Install the EXE once. Projects, plans, exports and backups stay in **Documents / Vastu**.
Core features work offline; maps and online services need internet. The current
installer is unsigned, so Windows may display an unknown-publisher warning.
Updates download from published releases and offer **Restart to update**, saving
and backing up first. Draft releases are not offered to installed apps.

## Build

```powershell
npm ci --prefix desktop
node scripts/verify-renderer.cjs
npm run desktop:verify
npm run desktop:build
npm run desktop:smoke -- --packaged
```

Output: `release-artifacts/desktop/`. Data: `Documents/Vastu/projects.db`, `plans/`,
`exports/`, `backups/`. The File menu opens the data folder or makes a backup.

## Release without an extra token

1. Commit Windows changes here. When shared UI changes, refresh the verified Expo
   export in `desktop/web-dist` and `renderer-manifest.json` first.
2. Increment `desktop/package.json` and its lockfile; edit `RELEASE_NOTES.md`.
3. Push to `main` or run **Actions / Build Windows app** manually.
4. CI builds and tests, then creates or refreshes a **draft release** using the
   built-in GitHub token. No personal access token or private source access needed.
5. Review and publish the draft. Keep EXE, `.exe.blockmap` and `latest.yml` together.
   CI never overwrites already published versions.

Optional signing secrets: `WINDOWS_CSC_LINK`, `WINDOWS_CSC_KEY_PASSWORD`.
No credential is embedded in the app. Keep its app ID and Documents folder stable.

## Data safety

SQLite and imported images stay outside the install directory. Close/update waits
for edits to save. Backups include database and plans. Schema upgrades back up
first; newer/corrupt schemas fail without resetting data. Uninstall preserves
Documents/Vastu. To restore, close the app, copy current data somewhere safe, then
restore both `projects.db` and `plans/` from one backup. Avoid opening the same live
OneDrive-synced database on two PCs simultaneously.

## Precise map boundaries

Draw roughly on the map, then click a side's length label, type the measured length, and press Enter or Apply. Click a numbered corner to set its angle, choose Make 90 degrees, or delete it with the trash icon. Drag corners to move them. The map stays visible throughout; Undo restores edits during the map session.

For a rectangle, choose Rectangle, enter width/depth and rotation, and Apply. With an empty map, the tool first asks for one corner. Dashed outlines preview changes without saving them. Rotation 0 is horizontal on the map; the +/- controls turn by 5 degrees. Existing boundaries start unlocked, with an optional lock for protection.

Review plot applies the boundary's dimensions to the grid. Corner coordinates remain available as optional details. Zoom reaches 24 by enlarging available tiles; it adds no imagery detail. Windows bundles its map library locally, so saved boundaries can be edited without imagery. DWG import is not included.

Satellite zoom automatically falls back to the nearest available lower-resolution tile and enlarges its matching region. Missing tiles are requested with blankTile=false so gray provider placeholders are not drawn. Zoom 24 was checked against live Ratlam imagery; enlarged images can appear blurry. The fallback keeps all plot coordinates unchanged.
