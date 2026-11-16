# ioBroker.victron-vrm-api: development

[Overview](../README.md) | [Deutsch](de/development.md)

```bash
npm install
npm run build
npm test          # unit tests and package tests
npm run lint
```

## dev-server

```bash
npm run dev-server -- setup --adminPort 8083   # once: local ioBroker test instance in .dev-server/
npm run dev-server watch                       # run it, admin on http://127.0.0.1:8083/
```

Choose an admin port that no other dev-server uses. All other ports of the dev-server are derived from it by
fixed offsets (+12345, +14345, +16345, +18345), so with 8083 it also needs 20428, 22428, 24428 and 26428.

`watch` compiles changed files, but not newly created ones. After adding a new `.ts` file, run
`npx build-adapter ts` once. Do not use `npm run build` while `watch` is running, because it deletes `build/` first.

Do not start the instance in the dev-server admin. In `watch` mode nodemon runs the adapter itself. If the
instance is enabled as well, both processes collide (`ADAPTER_ALREADY_RUNNING`). To disable the instance, run
the following in `.dev-server/default`:

```bash
node node_modules/iobroker.js-controller/iobroker.js stop victron-vrm-api.0
```

`npm run dev-server` first applies the patches in `patches/` with [patch-package](https://github.com/ds300/patch-package):

- `ps-tree`: reads the process list via PowerShell, because Windows 11 25H2 and later no longer ship `wmic.exe`
  (`spawn wmic.exe ENOENT`).
- `@iobroker/dev-server`: no longer crashes with `ENOENT … .js.map` when `build/` is deleted while `watch` is
  running (e.g. by `npm run build`).
