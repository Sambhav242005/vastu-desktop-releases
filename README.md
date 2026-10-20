# Vastu Grid for Windows

[Download Windows installers](https://github.com/Sambhav242005/vastu-desktop-releases/releases)

This repo contains the Windows Electron shell, tests, build workflow and compiled
Expo renderer. Android/Expo source stays private; CI does not access that repo.

## Use

Install the EXE once. Projects, plans, exports and backups stay in **Documents / Vastu**.
Core features work offline; maps and online services need internet. The current
installer is unsigned, so Windows may display an unknown-publisher warning.
Updates are announced inside the app. Choose **Download update** or **Later**. A circular icon and progress bar show the download; **Restart to update** saves and backs up before quiet installation and relaunch. Draft releases are not offered to installed apps.

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
2. Sync the shared Expo/Windows release version in the source project, refresh its renderer export and manifest version, then edit `RELEASE_NOTES.md`. The renderer and Windows package versions must match.
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

Side length locks: click a side, enter its measurement and choose Apply & lock length. A padlock marks that side; Unlock length makes it editable. Dragging an endpoint follows the locked radius. A corner with two incident locked sides stays fixed. Compatible side-length and angle edits adjust connected corners while preserving locked lengths. Adding/deleting corners, clearing the boundary and replacing it with a rectangle still require unlocking side lengths first. Impossible or unresolved combinations are rejected. Undo restores both geometry and locks. Locks are saved with each project's boundary.

Corner sizes and length-label density adapt to the plot's size on screen. Angle badges appear beside corners when there is room and always for the selected corner. Click a corner to see/edit its inside angle. The selected side stays readable when other labels are hidden to avoid overlap. The free imagery source remains unchanged; no extra provider key is required.

Version 1.1.7 fixes closing-side edits with existing locks. The selected corner stays fixed while a bounded spherical-distance solver adjusts connected corners, preserves polygon winding and rejects crossing solutions. Previews use the same solver as Apply. The Windows regression sets three locked 30 ft sides, closes and locks the fourth at 30 ft, then makes a corner 90 degrees with all four lengths unchanged.

Version 1.1.8: drag the filled interior to move the entire plot while preserving lengths, length locks and corner angles. Outside drags pan the map. Undo restores the previous position; Escape cancels an active drag. Focus the boundary and use arrow keys for small nudges. The overall editing lock also prevents frame movement.

Version 1.1.9: the compass and North button use geographic north independently of plot rotation. The grid still follows the plot sides. In View grid, choose Set entrance, then click the open wall. Its midpoint, outward direction and relative placement are saved and used in preview/PDF/DXF. Changing the plot angle updates the selected entrance direction; choosing a manual entrance replaces the clicked wall selection.

Version 1.1.10 improves PDF report layout: severity labels no longer wrap, short findings tables stay together, and long tables repeat their headings with rows kept intact. Re-export existing reports to use the improved formatting.

Version 1.1.11 adds the in-app update panel, progress ring/bar, retry and Later actions. Settings and the native window title display the installed version. CI checks renderer version alignment and exercises the complete update UI with offline fixtures, including save/backup before the silent-install request.
