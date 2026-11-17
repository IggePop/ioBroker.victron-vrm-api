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

## Release

```bash
npm run release patch -- --yes   # or minor, major
```

The release script runs without questions with `--yes`. Before changing anything, it runs `npm run lint`,
`npm run check` and `npm test` and stops if one of them fails. Then it moves the entries under `WORK IN PROGRESS` in
the changelog to the new version, updates `package.json` and `io-package.json`, builds, commits, tags and pushes.
The tag starts the `deploy` job, which publishes the package to npm. Stop `dev-server watch` before, because the
release runs `npm run build`.

### News in `io-package.json`

Without further steps, the release script translates the changelog entries automatically into the news of all
languages. The translation also changes state ids and terms, e.g. `energy.*.autarky` became `Energie.*.Autarkie`.
So write the news of the next version by hand right before the release:

1. Add an entry `NEXT` at the beginning of `common.news` in `io-package.json`, with the text in all 11 languages
   (one line per change, separated by `\n`). Keep state ids, `sendTo` commands and VRM terms unchanged.
2. Run the release with `--all`: `npm run release minor -- --yes --all`. The script renames `NEXT` to the new version
   and translates nothing. `--all` takes the uncommitted change of `io-package.json` into the release commit.

Do not commit `NEXT` itself: the schema of `io-package.json` only allows version numbers there, so the package tests
fail. The release script writes `io-package.json` with an indentation of 2 spaces; do not format it with Prettier,
otherwise the next diff contains hundreds of changed lines.
