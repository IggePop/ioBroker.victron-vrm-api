# ioBroker.victron-vrm-api: Entwicklung

[Übersicht](README.md) | [English](../development.md)

```bash
npm install
npm run build
npm test          # Unit-Tests und Package-Tests
npm run lint
```

## dev-server

```bash
npm run dev-server -- setup --adminPort 8083   # einmalig: lokale ioBroker-Testinstanz in .dev-server/
npm run dev-server watch                       # starten, Admin unter http://127.0.0.1:8083/
```

Als Admin-Port einen Port wählen, den kein anderer dev-server verwendet. Alle anderen Ports des dev-servers werden
mit festen Abständen daraus abgeleitet (+12345, +14345, +16345, +18345). Mit 8083 belegt er also auch 20428, 22428,
24428 und 26428.

`watch` übersetzt geänderte Dateien, aber keine neu angelegten. Nach dem Anlegen einer neuen `.ts`-Datei einmal
`npx build-adapter ts` ausführen. Während `watch` läuft, kein `npm run build` verwenden, weil es zuerst `build/`
löscht.

Die Instanz nicht im Admin des dev-servers starten. Im `watch`-Modus startet nodemon den Adapter selbst. Ist die
Instanz zusätzlich aktiviert, kommen sich beide Prozesse in die Quere (`ADAPTER_ALREADY_RUNNING`). Um die Instanz zu
deaktivieren, in `.dev-server/default` ausführen:

```bash
node node_modules/iobroker.js-controller/iobroker.js stop victron-vrm-api.0
```

`npm run dev-server` wendet zuerst die Patches in `patches/` mit
[patch-package](https://github.com/ds300/patch-package) an:

- `ps-tree`: liest die Prozessliste über PowerShell, weil Windows 11 ab 25H2 kein `wmic.exe` mehr mitbringt
  (`spawn wmic.exe ENOENT`).
- `@iobroker/dev-server`: stürzt nicht mehr mit `ENOENT … .js.map` ab, wenn `build/` gelöscht wird, während
  `watch` läuft (z. B. durch `npm run build`).
