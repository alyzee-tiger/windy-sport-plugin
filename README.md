# Windy Plugin Template

Template for development of Windy Plugins.

**Documentation at: [https://docs.windy-plugins.com/](https://docs.windy-plugins.com/)**

**Documentation for the Leaflet GL library is at [https://windycom.github.io/LeafletGL/docs/](https://windycom.github.io/LeafletGL/docs/)**

## Quick start

- Install dependencies with `npm i`
- Compile the plugin in watch mode with `npm start`
- Navigate to <https://www.windy.com/developer-mode>
- Load your plugin from the URL <https://localhost:9999/plugin.js>
- Code away!

For running the examples:

- Build the desired example in watch mode with `npm run example01` (or `example02`, etc.)
- Load the example in Windy's developer mode using the URL <https://localhost:9999/example01/plugin.js>

## Drapeaux sport

- Seuils : `src/sports.config.ts` (vert / orange / sinon rouge, par mesure et par sport)
- Calcul : `src/flags.ts` (`conditionsAt()` convertit les données Windy, `evaluate()` donne le drapeau)
- Affichage : `src/plugin.svelte` (modèles `ecmwf`, `ecmwfWaves`, `cams`)
- Tests : `npm test` (Node >= 23, sans dépendance)

### Réglages de performance

Valeurs figées à la compilation (pas de serveur ni de `.env`) : modifier le fichier puis recompiler.

| Réglage | Fichier | Valeur | Effet |
|---|---|---|---|
| `MAX_PARALLEL` | `src/plugin.svelte` | 32 | Requêtes Windy en parallèle. Baisser si Windy rame pendant le chargement de la carte |
| `REQUEST_TIMEOUT` | `src/plugin.svelte` | 15 s | Abandon d'une requête sans réponse |
| `AIRQ_STEP` | `src/plugin.svelte` | 0,5° | Cases voisines qui partagent la même requête qualité de l'air |
| `ALERTS_STEP` | `src/plugin.svelte` | 1° | Idem pour les alertes officielles |
| `across` | `src/grid.ts` (`cellsIn`) | 32 | Nombre de cases dans la largeur de l'écran (finesse de la carte) |
| `MIN_SIZE` | `src/grid.ts` | 0,125° | Taille minimale d'une case (résolution d'ECMWF) |

### Lancer dans Windy

1. `npm i` puis `npm start` : compile en continu et sert le plugin sur <https://localhost:9999/plugin.js>
2. Ouvrir une fois <https://localhost:9999/plugin.js> et accepter le certificat auto-signé
3. Aller sur <https://www.windy.com/developer-mode>, charger `https://localhost:9999/plugin.js`
4. Cliquer sur la carte : un drapeau par sport pour ce point, à l'heure de la barre de temps

Après une modification, le plugin est recompilé automatiquement : recharger la page Windy.

### Valeurs récupérables depuis Windy

Via `getPointForecastData(model, { lat, lon, step: 1 })` de `@windy/fetch`, une valeur par pas de temps.

**Météo** (modèles `ecmwf`, `gfs`, `icon`, `iconEu`, `arome`, ...) :

| Champ | Unité | Utilisé |
|---|---|---|
| `temperature`, `feelTemperature` | K | `temp`, `feel` |
| `wind`, `windGust` | m/s | `wind`, `gust`, `gustSpread` |
| `windDir` | ° (d'où vient le vent) | |
| `precipAmount` | mm par pas | `rain` (ramené en mm/h) |
| `precipSnowAmount`, `precipConvectiveAmount` | mm par pas | |
| `precipType` | code (0 aucune, 1 pluie, 2 pluie verglaçante, 3 grésil, 4 neige, ...) | `ice` (2, 3) |
| `icon` | code météo (14-16, 21, 23, 24 = orage ; 17, 22 = brouillard) | `storm`, `fog` |
| `pressure` | Pa | |
| `isDay`, `hour`, `moonPhase` | booléen, heure locale, code | |

**Vagues** (modèles `ecmwfWaves`, `gfsWaves`, `iconEuWaves`, ...) : les champs météo plus

| Champ | Unité | Utilisé |
|---|---|---|
| `waves`, `wavesPeriod`, `wavesDir` | m, s, ° | `waves`, `wavesPeriod` |
| `wavesPower` | puissance des vagues | |
| `swell1`, `swell2` (+ `Dir`, `Period`) | m, °, s | |

**Qualité de l'air** (modèles `cams`, `camsEu`, pas de temps propres) :

| Champ | Unité | Utilisé |
|---|---|---|
| `aqiUs` | indice US AQI 0-500 | `aqi` |
| `pm2p5`, `pm10` | µg/m³ (à vérifier) | `pm25` |
| `go3` (ozone) | µg/m³ (à vérifier) | `o3` |
| `no2`, `chemsCosc` (CO), `chemsSo2sm`, `chemsDustsm` | concentration (unité à vérifier) | |
| `pollenAlder`, `pollenBirch`, `pollenGrass`, `pollenMugwort`, `pollenOlive`, `pollenRagweed` | concentration, optionnels | |

**Options en plus** (3e paramètre de `getPointForecastData`, ex. `{ meteogram: true }`) :

- `meteogram` : `dewPoint` (K), `cloudBase` (m), nébulosité par niveau d'altitude
- `summary` : résumé par jour

**Pas disponibles en prévision ponctuelle** : UV, CAPE, visibilité. Ils existent seulement en calques de carte
(`uvindex`, `cape`, `thunder`, `visibility`) et ne se lisent qu'avec `getLatLonInterpolator()` quand le calque est affiché.

## Known issues

- In *example03* the boat orientation resets after the user zooms.
This is likely related to Leaflet GL executing `zoom` events in slightly different order.
Markers now also internally subscribe to the map's `zoom` event to update their CSS positioning,
which likely executes *after* the user's `zoom` event in this example.
- In *example04* map clicks within the rendered cycle do not fire the `singleclick` event, as they have before Leaflet LG.

## CHANGELOG

-   5.0.0
    -   Updated example code for the new Leaflet GL map library introduced in client v49.0.0
-   4.2.2
    -   New plugins are marked as private by default
-   4.2.1
    -   Updated `@windycom/plugin-devtools` for client v46.1.0
-   4.2.0
    -   Fixed compiler sourcemap error
-   4.1.0
    -   Updated plugin upload URL
-   4.0.0
    -   Updated `@windycom/plugin-devtools` for client v45.0.0
-   3.0.0
    -   Updated `@windycom/plugin-devtools` for client v42.2.0
-   2.0.0
    -   Completely new version of the plugin system based in Windy client v42+
-   1.0.0
    -   New rollup compiler, no more riot architecture
    -   Updated examples for Windy client v39
-   0.4.0
    -   Added `plugin-data-loader` to the Plugins API
-   0.3.0
    -   Examples moved to examples dir
-   0.2.0
    -   Fixed wrong examples
-   0.1.1
    -   Initial version of this repo
