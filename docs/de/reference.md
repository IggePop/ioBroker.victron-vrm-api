# ioBroker.victron-vrm-api: Referenz

[Übersicht](README.md) | [English](../en/reference.md)

## Einstellungen

| Option | Standard | Beschreibung |
|---|---|---|
| Zugriffstoken | – | VRM-Zugriffstoken. Es wird verschlüsselt gespeichert. |
| Verbindung testen | – | Schaltfläche: prüft das eingegebene Token, auch schon vor dem Speichern, und zeigt Benutzer und Anlagen an |
| Anlagen | alle | Abzufragende Anlagen |
| Intervall Live-Werte / Diagnose | 1 min | Wie oft die Diagnosewerte abgerufen werden (1–1440 min) |
| Daten als veraltet markieren nach | 30 min | Setzt `info.dataStale`, wenn VRM so lange keine neuen Daten erhalten hat |
| Energiestatistik abrufen | an | Energiesummen, siehe unten |
| Intervall Energiestatistik | 15 min | Wie oft die Energiesummen abgerufen werden (1–1440 min) |
| Prognose abrufen | an | Prognose, siehe unten |
| Intervall Prognose | 60 min | Wie oft die Prognose von VRM abgerufen wird (15–1440 min) |
| Alarme abrufen | an | Alarmprotokoll, siehe unten |
| Intervall Alarme | 5 min | Wie oft das Alarmprotokoll abgerufen wird (1–1440 min) |
| Phasensummen berechnen | an | Bildet Summen über L1–L3, siehe unten |
| Geräte und Werte ausschließen | – | Ausschlussliste, siehe unten |
| Veraltete Objekte löschen | aus | Räumt beim Start den Objektbaum auf, siehe unten |
| Timeout für Anfragen | 30 s | HTTP-Timeout pro Anfrage |

> **Wie aktuell sind die Daten?** Das GX-Gerät sendet seine Daten im Takt seines *Log-Intervalls* an VRM.
> Voreingestellt sind 15 Minuten. Häufigeres Abfragen bringt keine neuen Werte. Für nahezu Live-Daten am GX-Gerät
> **Einstellungen → VRM-Online-Portal → Log-Intervall** auf 1 Minute stellen.

## Datenpunkte

```
victron-vrm-api.0
├─ info.connection            mit der VRM-API verbunden
├─ info.lastUpdate            letzte erfolgreiche Abfrage
├─ info.user.id / .name       VRM-Konto
└─ <idSite>                   ein Gerät pro Anlage
   ├─ info.name, .identifier, .timezone
   ├─ info.lastTimestamp      Zeitpunkt der neuesten Daten in VRM
   ├─ info.dataStale          true, wenn VRM länger als eingestellt keine neuen Daten hat
   ├─ live.*                  bekannte Werte (siehe unten)
   │  └─ tanks.tank_<instance> level, remaining, fluidType
   ├─ energy
   │  └─ today | week | month | year
   │     ├─ solarYield, consumption, gridImport, gridExport,
   │     │  batteryCharged, batteryDischarged (genset, falls vorhanden),
   │     │  autarky, selfConsumption (%)
   │     └─ flows.*           pvToConsumers, pvToBattery, pvToGrid, gridToConsumers, …
   ├─ forecast              solar…/consumption… Today, RemainingToday, Tomorrow, PowerNow; hourly (JSON)
   ├─ alarms                count, active, activeText, activeList, lastText, lastStarted, lastCleared, history
   ├─ devices
   │  └─ <device>_<instance>  name, deviceType, customName, productName, productCode,
   │                          firmwareVersion, lastConnection, instance
   │                          (Gateway zusätzlich: loggingInterval, lastPowerUpOrRestart; Fronius: model)
   └─ diagnostics
      └─ <device>_<instance>  z. B. battery_monitor_279, ve_bus_system_276, grid_meter_40
         ├─ <code>            ein Datenpunkt pro VRM-Datenattribut, z. B. "bv", "IP1", "g1p"
         └─ sum.*             Summen über L1–L3 (falls aktiviert)
```

Die IDs der Geräteordner (`pv_inverter_20`) bleiben stabil. Die im Admin angezeigten Namen kommen aus VRM, ein
Umbenennen in VRM bricht also keine Skripte und keinen Verlauf. Die Geräteliste wird beim Start und danach stündlich
gelesen.

### Qualität veralteter Werte

Sendet eine Anlage länger als unter **Daten als veraltet markieren nach** eingestellt keine neuen Daten an VRM
(`info.dataStale` = `true`), behalten ihre Werte den letzten Wert, erhalten aber die Qualität `q` = `0x42` („Gerät
nicht verbunden“, gemeint ist das GX-Gerät). Das gilt für `live.*`, `diagnostics.*` (samt Phasensummen) und
`energy.*`. Sobald wieder neue Daten kommen, geht die Qualität zurück auf `0x00` (gut). Die Energiesummen folgen mit
ihrer nächsten Abfrage.

Skripte und Visualisierungen können die Qualität am Datenpunkt ablesen (`getState(id).q`), der Admin zeigt sie in
der Objektliste an.

## Live-Werte

Jeder Wert stammt aus der Systemübersicht des GX-Geräts. Fehlt er dort, greift der Adapter auf die einzelnen Geräte
zurück. Bei mehreren Batteriemonitoren stammen alle Batteriewerte dann von dem mit der kleinsten Instanz. Ein Datenpunkt wird nur angelegt, wenn die Anlage den Wert meldet.

| Datenpunkt | Einheit | Beschreibung |
|---|---|---|
| `live.soc` | % | Ladezustand der Batterie |
| `live.batteryVoltage` | V | Batteriespannung |
| `live.batteryCurrent` | A | Batteriestrom |
| `live.batteryPower` | W | Batterieleistung (positiv = laden) |
| `live.pvDcPower` | W | PV-Leistung, DC-gekoppelt (Solarladeregler) |
| `live.pvAcPower` | W | PV-Leistung, AC-gekoppelt (PV-Wechselrichter) |
| `live.pvPower` | W | PV-Leistung gesamt |
| `live.gridPower` | W | Netzleistung, Summe aller Phasen (positiv = Bezug) |
| `live.consumption` | W | AC-Verbrauch, Summe aller Phasen |
| `live.batteryTimeToGo` | h | Restlaufzeit der Batterie, wie sie der Batteriemonitor berechnet, leer während des Ladens |
| `live.batteryTemperature` | °C | Batterietemperatur |
| `live.acOutPower` | W | Leistung der Verbraucher am AC-Ausgang des Wechselrichters/Laders, Summe aller Phasen |
| `live.gensetPower` | W | Generatorleistung, Summe aller Phasen |
| `live.evChargerPower` | W | Ladeleistung aller Wallboxen |

Tanksensoren erhalten je einen Ordner `live.tanks.tank_<Instanz>`, benannt nach der Flüssigkeit, z. B.
„Tank 21 (Fresh water)“:

| Datenpunkt | Einheit | Beschreibung |
|---|---|---|
| `level` | % | Füllstand |
| `remaining` | m³ (oder die Einheit, die VRM meldet) | Restmenge |
| `fluidType` | – | Flüssigkeit als Zahl, die Namen stehen im Objekt (z. B. 1 = Frischwasser, 7 = Diesel) |

## Energiestatistik

Der Adapter liest die Energieflüsse aus VRM (`overallstats`) und summiert sie. Alle Werte sind in kWh, die Zeiträume
entsprechen denen in VRM.

| Datenpunkt | Berechnung | VRM-Codes |
|---|---|---|
| `solarYield` | PV an Verbraucher + Batterie + Netz | Pc + Pb + Pg |
| `consumption` | PV + Netz + Batterie + Generator an Verbraucher | Pc + Gc + Bc + gc |
| `gridImport` | Netz an Verbraucher + Batterie | Gc + Gb |
| `gridExport` | PV + Batterie ins Netz | Pg + Bg |
| `batteryCharged` | PV + Netz + Generator in die Batterie | Pb + Gb + gb |
| `batteryDischarged` | Batterie an Verbraucher + Netz | Bc + Bg |
| `genset` | Generator an Verbraucher + Batterie (nur falls vorhanden) | gc + gb |

Die Summen stimmen mit denen in VRM überein (Solarertrag, Verbrauch, Energie aus dem und ins Netz). Flüsse ohne
Daten, z. B. ein nicht vorhandener Generator, werden nicht angelegt.

Zusätzlich gibt es pro Zeitraum zwei Kennzahlen in Prozent:

| Datenpunkt | Berechnung | Bedeutung |
|---|---|---|
| `autarky` | 1 − gridImport / consumption | Autarkiegrad: Anteil des Verbrauchs, der nicht aus dem Netz gedeckt wird |
| `selfConsumption` | 1 − gridExport / solarYield | Eigenverbrauchsquote: Anteil des PV-Ertrags, der vor Ort genutzt statt eingespeist wird |

Beide sind auf 0–100 % begrenzt und leer, wenn es nichts zu teilen gibt, z. B. `selfConsumption` vor
Sonnenaufgang. Netzstrom, der in die Batterie geladen wird, zählt als Netzbezug, Batteriestrom, der ins Netz geht,
als Einspeisung. So fällt keine der beiden Kennzahlen zu günstig aus.

## Prognose

VRM berechnet stündliche Prognosen für PV-Ertrag und Verbrauch. Der Adapter stellt sie pro Anlage bereit. Meldet VRM
zusätzlich Prognosen für Wärmepumpe oder Wallbox, erscheinen sie als `heatPump…` und `evCharger…`.

| Datenpunkt | Einheit | Beschreibung |
|---|---|---|
| `forecast.solarToday` / `consumptionToday` | kWh | Ganzer heutiger Tag |
| `forecast.solarRemainingToday` / `consumptionRemainingToday` | kWh | Von jetzt bis Mitternacht |
| `forecast.solarTomorrow` / `consumptionTomorrow` | kWh | Ganzer morgiger Tag |
| `forecast.solarPowerNow` / `consumptionPowerNow` | W | Erwartete mittlere Leistung in der aktuellen Stunde |
| `forecast.hourly` | JSON | `[{"ts": 1793530800000, "solar": 6302, "consumption": 2415}, …]` mit Wh pro Stunde für heute und morgen |

Die Tage werden in der Zeitzone der Anlage gezählt. Der Adapter ruft die Prognose stündlich von VRM ab und berechnet
den Rest von heute und die aktuelle Stunde alle 5 Minuten aus diesen Daten neu.

## Alarme

Der Adapter liest das Alarmprotokoll jeder Anlage (`/installations/{id}/alarm-log`), dieselbe Liste, die VRM unter
**Alarmprotokolle** zeigt. Dort erscheinen nur Alarme, die VRM überwacht. Welche das sind, wird in VRM unter
**Einstellungen → Alarmregeln** festgelegt.

| Datenpunkt | Typ | Beschreibung |
|---|---|---|
| `alarms.count` | Zahl | Anzahl aktiver Alarme |
| `alarms.active` | Boolean | `true`, solange mindestens ein Alarm aktiv ist, gut als Auslöser |
| `alarms.activeText` | Text | Aktive Alarme, z. B. `VE.Bus System: Overload L1 (Warning)`, leer, wenn keine aktiv sind |
| `alarms.activeList` | JSON | Aktive Alarme als Liste (siehe unten) |
| `alarms.lastText` | Text | Neuester Alarm, aktiv oder bereits beendet |
| `alarms.lastStarted` / `lastCleared` | Datum | Beginn und Ende des neuesten Alarms in ms, `lastCleared` ist leer, solange er aktiv ist |
| `alarms.history` | JSON | Die letzten 25 Alarme, neueste zuerst |

Ein Eintrag der JSON-Listen sieht so aus:

```json
{"device": "VE.Bus System", "instance": 276, "text": "Low battery (Warning)", "level": "Warning",
 "active": false, "started": 1793453315000, "cleared": 1793453344000}
```

Als Gerät steht der eigene Name aus VRM, falls einer vergeben ist. Das Alarmprotokoll wird standardmäßig alle
5 Minuten abgerufen. Ein Alarm kann erst erscheinen, wenn das GX-Gerät seine Daten an VRM gesendet hat, siehe
Log-Intervall oben.

## Phasensummen

Für Leistungs-, Strom- und Energiewerte, die ein Gerät pro Phase meldet, legt der Adapter eine Summe im Ordner `sum`
dieses Geräts an. Beispiele:

| Datenpunkt | Quellwerte |
|---|---|
| `diagnostics.system_overview_0.sum.Grid` | Grid L1 + L2 + L3 |
| `diagnostics.grid_meter_40.sum.Grid_Energy_from_net` | Grid L1–L3 – Energy from net |
| `diagnostics.ve_bus_system_276.sum.Input_power` | Input power 1 + 2 + 3 |

Der Adapter erkennt die Phase am Namen oder am D-Bus-Pfad und die Größe am Namen oder an der Einheit (W, A, kWh).
Eine Summe wird angelegt, sobald mindestens zwei Phasen vorhanden sind. Sollwerte, Grenzwerte und Minimal- oder
Maximalwerte (z. B. `Hub4 power setpoint`, `Max Feedin Power`) erhalten keine Summe, weil ihre Summe kein Messwert
ist. `native.sources` jedes Summen-Datenpunkts listet die Codes, aus denen er gebildet wurde.

## Geräte und Werte ausschließen

Eine einzige Anlage meldet schnell mehr als 500 Diagnosewerte. Mit der Ausschlussliste bleibt der Objektbaum
überschaubar. Ein Muster pro Zeile. `*` steht für beliebigen Text, `?` für ein einzelnes Zeichen. Groß- und
Kleinschreibung spielt keine Rolle, Zeilen, die mit `#` beginnen, sind Kommentare. Jedes Muster wird verglichen mit:

| Verglichen mit | Beispielmuster | Schließt aus |
|---|---|---|
| Geräteordner | `gateway_0`, `pv_inverter_*` | das ganze Gerät |
| Gerätename aus VRM | `MultiPlus*` | das ganze Gerät |
| Geräteordner und Wert-ID | `ve_bus_system_276.v*` | einzelne Werte eines Geräts |
| Name des Werts | `*alarm*`, `Phase rotation` | Werte mit diesem Namen bei allen Geräten |

```
# Firmware- und VE.Bus-Details des Multi
ve_bus_system_276.v*
# Alarm- und Warn-Flags (das Alarmprotokoll steht in alarms.*)
*alarm*
*warning*
```

Die Liste gilt für `diagnostics.*`, die Phasensummen (z. B. `ve_bus_system_276.sum.*`) und die Geräteliste
`devices.*`. Die Live-Werte bleiben immer erhalten. Bereits vorhandene Werte werden nur entfernt, wenn
**Veraltete Objekte löschen** eingeschaltet ist.

## Veraltete Objekte löschen

Der Adapter löscht nie von sich aus Objekte. Ist **Veraltete Objekte löschen** eingeschaltet, entfernt er bei jedem
Start nach der ersten erfolgreichen Abfrage:

- Anlagen, die nicht mehr ausgewählt oder nicht mehr im Konto sind,
- Geräte (`devices.*`, `diagnostics.*`), die VRM nicht mehr meldet, z. B. nachdem sie in der VRM-Geräteliste entfernt
  wurden,
- die Ordner `energy`, `forecast` und `alarms`, wenn die zugehörige Option abgeschaltet ist,
- die Ordner `sum`, wenn die Phasensummen abgeschaltet sind, und einzelne Summen, die nicht mehr berechnet werden,
- Geräte und Werte, auf die die Ausschlussliste passt.

Jedes gelöschte Objekt wird protokolliert. Von History, InfluxDB oder SQL bereits gespeicherte Daten bleiben
erhalten, die Einstellungen der gelöschten Datenpunkte (z. B. die History-Aufzeichnung) gehen aber verloren. Liefert
VRM eine leere Geräteliste, werden keine Geräte gelöscht.

## Anfragen aus Skripten

Skripte können mit `sendTo` beliebige weitere VRM-Daten über den Adapter lesen. Das Token bleibt in der
Adapterkonfiguration, und die Anfrage läuft über dieselbe Warteschlange wie die des Adapters, das Rate-Limit von VRM
gilt also für beide.

```js
sendTo("victron-vrm-api.0", "get", {
    path: "/installations/123456/stats",
    params: { type: "kwh", interval: "days", start: 1772323200, end: 1774998000 },
}, result => {
    if (result.error) {
        log(`VRM request failed: ${result.error}`, "warn");
    } else {
        log(JSON.stringify(result.data.records));
    }
});
```

| Feld | Beschreibung |
|---|---|
| `path` | Pfad der [VRM-API](https://vrm-api-docs.victronenergy.com/), z. B. `/installations/<idSite>/widgets/BatterySummary` |
| `params` | Query-Parameter als Objekt. Arrays werden zu wiederholten Parametern, z. B. `{ "attributeCodes[]": ["Pc", "Pb"] }` |

Die Antwort ist `{ data }` mit der vollständigen VRM-Antwort oder `{ error, status }` mit dem HTTP-Status, falls VRM
einen geliefert hat. Möglich sind nur GET-Anfragen, und nur für Pfade unterhalb der Anlagen, die der Adapter abfragt
(`/installations/<idSite>/…`), und für den eigenen Benutzer (`/users/me`, `/users/<eigene ID>/…`). Skripte dürfen bis
zu 30 Anfragen pro Minute senden.
