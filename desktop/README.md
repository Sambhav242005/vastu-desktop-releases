# Windows runtime

See the [repository README](../README.md) for building and releasing.

`main.cjs` hosts the sandboxed Expo renderer, menus and exports. `preload.cjs`
exposes scoped desktop operations. `data.cjs` saves projects and imported plans in
Documents/Vastu with complete backups. `updates.cjs` saves and backs up before
installing updates. The app ID and data location match the original installer.
