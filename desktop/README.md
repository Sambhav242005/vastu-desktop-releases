# Vastu Grid for Windows

The desktop app bundles the existing Expo SDK 57 application in Electron. It does
not depend on Metro, Node.js, a browser installation, or an internet connection on
the user's PC. Manual plot setup, orientation, grids, Kundli calculations, local
projects, plan imports, PDF and DXF exports work offline. Maps and online services
still require a connection. The separate `web/` Next.js website is not packaged.

## User files

Electron resolves Windows' actual Documents location (including redirected
Documents), then uses:

```text
Documents\Vastu\
  projects.db       SQLite project records and preferences
  plans\            Imported image files referenced by projects
  exports\          Default folder for PDF and DXF output
  backups\          Complete snapshots: projects.db + plans
```

The installer replaces application files only. Neither upgrade nor uninstall
deletes this Documents folder. Keep the app ID and this folder name stable across
versions. Chromium's disposable cache stays in AppData; it is not the project
database. Android and ordinary browser storage retain their existing behavior.

Writes commit to SQLite before save acknowledgements. On close or restart to
update, Electron asks the workspace to flush pending edits; a failed save keeps
the app open. Before applying an update it snapshots both the database and plan
images. Startup also backs up before a version/schema change. A newer schema or a
corrupt database produces an error instead of recreating an empty database.

Use **File → Open Vastu data folder** or **File → Back up projects and plans**.
To restore: close Vastu, copy the current Vastu folder somewhere safe, then copy
`projects.db` and the complete `plans` folder from the chosen backup into Vastu.
Do not open the same live database from two computers via OneDrive simultaneously.

## Development and verification

From the repository root:

```powershell
npm ci
npm ci --prefix desktop
npm run desktop:prepare
npm run desktop:start
npm run desktop:verify
npm run desktop:smoke
npm run desktop:build
npm run desktop:smoke -- --packaged
```

`desktop:prepare` sets `VASTU_DESKTOP_EXPORT=1` only for that export so Expo emits
a single offline entry page. Normal Expo builds continue using app.json unchanged.
Desktop dependencies and their lockfile live in `desktop/` and are not added to
the Android dependency graph. Test data uses marked directories under `work/`,
never the user's Documents folder. Smoke checks block remote renderer requests,
exercise the UI, validate real PDF/DXF files, and reopen saved projects and plans.

## GitHub Actions and releases

Windows builds and releases now run entirely in the public repository:
https://github.com/Sambhav242005/vastu-desktop-releases

That repository contains the Electron shell, tests, icon, and compiled Expo
renderer. It does not fetch private Android/Expo sources. Its Actions workflow
uses GitHub's built-in repository token; **DESKTOP_RELEASE_TOKEN is not needed**.

Commit Windows runtime changes there and increment its desktop/package.json
and lockfile for a new release. For shared UI changes, run desktop:prepare here,
then copy the verified desktop/web-dist output to the public repository and
refresh its renderer-manifest.json. See the public README for build/release steps.

Pushing public main runs Windows build and offline smoke tests and prepares a
**draft release**. Review and publish it when ready. Drafts are not distributed
to installed apps. CI never overwrites a published version.

The public workflow supports optional WINDOWS_CSC_LINK and
WINDOWS_CSC_KEY_PASSWORD signing secrets. The current installer is unsigned.
Keep the same app ID, Documents folder and signing identity across updates.

The app checks published releases after 20 seconds and every four hours. Available updates download automatically while you keep working, with a progress ring, bar, percentage and byte counts. A downloaded update installs on the next normal close after saving and backing up projects and images. Restart to update applies it immediately and relaunches; Later keeps the current session open. Failed saving/backup keeps the app open. Windows shutdown/logoff defers installer execution. Help / Check for updates opens the same panel. Offline scheduled checks stay quiet and failures can be retried. Versions before 1.1.14 require Download update once to receive this new behavior.

Run `node desktop/tests/update-download.cjs` after a desktop build to exercise a real HTTP manifest/installer transfer with hash verification and the save/backup-on-close path. Only final installer execution is intercepted in this isolated test; no published feed or real project data is changed.

Verification includes a real installed 1.1.2 -> downloaded update 1.1.3 against
a local test release feed. The public channel remains a draft until published.

## Implementation references

- [Expo 57 web output](https://docs.expo.dev/versions/v57.0.0/config/app/#output)
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron application paths](https://www.electronjs.org/docs/latest/api/app#appgetpathname)
- [electron-updater](https://www.electron.build/docs/features/auto-update/)

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

Version 1.1.10 fixes report printing: severity badges stay on one line, short findings tables move together, and long tables repeat semantic column headings. To render the print regression locally with installed Google Chrome: `node desktop/tests/report-print.cjs`. Output PDFs are in `work/report-print/`; set `VASTU_PRINT_BROWSER=msedge` to use Edge instead.

Version 1.1.11 unifies the release version. Use `npm run release:version -- 1.1.11` to sync root/desktop package files and locks, Expo marketing version and Android native version/build code. `npm run verify:versions` and desktop export reject mismatches. Settings uses the installed Electron version on Windows. Android and desktop release configurations now share 1.1.11; older installed apps retain their old binary version until updated. Update UI verification: `node desktop/tests/update-ui.cjs --packaged`.
