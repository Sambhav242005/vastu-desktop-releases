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
