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

## Release

```bash
npm run release patch -- --yes   # oder minor, major
```

Mit `--yes` läuft das Release-Skript ohne Rückfragen. Bevor es etwas ändert, führt es `npm run lint`,
`npm run check` und `npm test` aus und bricht ab, wenn eines davon fehlschlägt. Danach verschiebt es die Einträge
unter `WORK IN PROGRESS` im Changelog zur neuen Version, aktualisiert `package.json` und `io-package.json`, baut,
committet, taggt und pusht. Der Tag startet den Job `deploy`, der das Paket auf npm veröffentlicht. Vorher
`dev-server watch` beenden, weil das Release `npm run build` ausführt.

### News in `io-package.json`

Ohne weiteres Zutun übersetzt das Release-Skript die Changelog-Einträge automatisch in die News aller Sprachen.
Dabei übersetzt es auch Datenpunkt-IDs und Begriffe, z. B. wurde aus `energy.*.autarky` `Energie.*.Autarkie`. Deshalb
die News der nächsten Version direkt vor dem Release von Hand schreiben:

1. In `io-package.json` am Anfang von `common.news` einen Eintrag `NEXT` mit dem Text in allen 11 Sprachen anlegen
   (eine Zeile pro Änderung, getrennt durch `\n`). Datenpunkt-IDs, `sendTo`-Befehle und VRM-Begriffe unverändert
   lassen.
2. Das Release mit `--all` starten: `npm run release minor -- --yes --all`. Das Skript benennt `NEXT` in die neue
   Version um und übersetzt nichts. `--all` nimmt die nicht committete Änderung an `io-package.json` in den
   Release-Commit auf.

`NEXT` selbst nicht committen: Das Schema von `io-package.json` erlaubt dort nur Versionsnummern, sonst schlagen die
Package-Tests fehl. Das Release-Skript schreibt `io-package.json` mit 2 Leerzeichen Einrückung; die Datei nicht mit
Prettier formatieren, sonst enthält der nächste Diff Hunderte geänderte Zeilen.
