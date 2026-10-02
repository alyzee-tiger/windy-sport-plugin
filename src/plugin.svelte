<div class="plugin__mobile-header">
    { title }
</div>
<section class="plugin__content">
    <div
        class="plugin__title plugin__title--chevron-back"
        on:click={ () => bcast.emit('rqstOpen', 'menu') }
    >
    { title }
    </div>

    <label class="mb-10">
        Sport affiché sur la carte
        <select bind:value={ sportId }>
            {#each Object.entries(sports) as [id, sport]}
                <option value={ id }>{ sport.icon } { sport.label }</option>
            {/each}
        </select>
    </label>

    <p class="size-s">
        { new Date(time).toLocaleString() }
        {#if pending} · chargement de la carte ({ pending }){/if}
    </p>

    {#if !spot}
        <p class="size-xs">Clique sur la carte pour voir le détail à cet endroit.</p>
    {:else if spotLoading}
        <p>Chargement…</p>
    {:else if spotError}
        <p>{ spotError }</p>
    {:else if detail}
        <p class="size-s">Au point { spot.lat.toFixed(3) }, { spot.lon.toFixed(3) } :</p>

        <h4 class="sf-flag sf-flag--{ detail.flag }">{ sports[sportId].icon } { sports[sportId].label }</h4>

        <div class="sf-timeline">
            {#each timeline as slot}
                <button
                    class="sf-timeline__slot sf-dot--{ slot.flag ?? 'none' }"
                    title={ formatTime(slot.time) }
                    on:click={ () => store.set('timestamp', slot.time) }
                ></button>
            {/each}
        </div>
        <div class="sf-timeline__labels size-xs">
            <span>{ formatTime(time) }</span>
            <span>+24 h</span>
            <span>+48 h</span>
        </div>

        <table>
            {#each detail.details as { metric, value, flag }}
                <tr>
                    <td>{ metricLabels[metric] }</td>
                    <td>{ format(metric, value) }</td>
                    <td><span class="sf-dot sf-dot--{ flag }"></span></td>
                </tr>
            {/each}
        </table>

        {#each spotAlerts as alert}
            <p class="sf-alert">
                ⚠️ { alert.headline ?? alert.event }
                <small>{ formatTime(alert.start) } → { formatTime(alert.end) }</small>
            </p>
        {/each}
    {/if}

    <div class="sf-legend size-xs">
        <h4>Seuils utilisés — { sports[sportId].icon } { sports[sportId].label }</h4>
        <table>
            <tr>
                <th></th>
                <th><span class="sf-dot sf-dot--green"></span></th>
                <th><span class="sf-dot sf-dot--orange"></span></th>
                <th><span class="sf-dot sf-dot--red"></span></th>
            </tr>
            {#each legend as { metric, cells }}
                <tr>
                    <td>{ metricLabels[metric] }</td>
                    {#each cells as cell}
                        <td>{ cell }</td>
                    {/each}
                </tr>
            {/each}
        </table>
        <p>
            Orange = hors de la plage verte mais dans la plage orange. Une donnée manquante compte orange.
            Ces seuils sont ceux de l'autrice : ils ne correspondent peut-être pas à ton niveau.
        </p>
    </div>
</section>
<script lang="ts">
    import bcast from '@windy/broadcast';
    import { getCapAlertsSummary, getPointForecastData } from '@windy/fetch';
    import { map, markers } from '@windy/map';
    import { singleclick } from '@windy/singleclick';
    import store from '@windy/store';
    import { isValidLatLonObj } from '@windy/utils';
    import { onDestroy, onMount } from 'svelte';

    import type { LatLon } from '@windy/interfaces';
    import type { AirQDataHash2, WavesDataHash2 } from '@windy/node-forecast-v3';
    import type { PointProducts } from '@windy/rootScope.d';

    import config from './pluginConfig';
    import { activeAlerts, conditionsAt, evaluate, flagOf, stepAt, type Sources } from './flags';
    import { cellsIn, type Cell } from './grid';
    import {
        metricLabels,
        sports,
        valueLabels,
        type Flag,
        type Metric,
        type Range,
        type Rule,
        type SportConfig,
    } from './sports.config';

    type Forecast = Partial<WavesDataHash2 & AirQDataHash2>;

    interface Tile {
        cell: Cell;
        shape: L.Polygon;
        sources?: Sources;
    }

    const { title, name } = config;

    const COLORS: Record<Flag, string> = { green: '#2ecc40', orange: '#ff851b', red: '#ff4136' };
    const WAVE_METRICS: Metric[] = ['waves', 'wavesPeriod'];
    const AIRQ_METRICS: Metric[] = ['aqi', 'pm25', 'o3'];
    const REQUEST_TIMEOUT = 15_000;
    // Windy's own UI uses the same connection: flooding it makes the whole site lag
    const MAX_PARALLEL = 32;
    // CAMS (~0.4°) and official alerts (per region) are coarse: nearby cells can share one request
    const AIRQ_STEP = 0.5;
    const ALERTS_STEP = 1;

    let sportId = 'velo';
    let time: number = store.get('timestamp');
    let pending = 0;

    let spot: LatLon | null = null;
    let spotSources: Sources | undefined;
    let spotLoading = false;
    let spotError = '';
    let spotRequest = 0;
    let spotMarker: L.Marker | null = null;

    const grid = new Map<string, Tile>();
    const cache = new Map<string, Promise<unknown>>();

    const waiting: (() => void)[] = [];
    let running = 0;

    /** Runs at most MAX_PARALLEL tasks; the newest waiting task goes first (current view, last click). */
    const limited = async <T>(task: () => Promise<T>): Promise<T> => {
        if (running < MAX_PARALLEL) {
            running++;
        } else {
            await new Promise<void>(start => waiting.push(start));
        }
        try {
            return await task();
        } finally {
            const next = waiting.pop();
            if (next) {
                next(); // hand our slot over
            } else {
                running--;
            }
        }
    };

    // Resolves undefined on error or no answer (e.g. waves inland, outside CAMS), so nothing waits forever
    const cached = <T>(key: string, request: () => Promise<T>) => {
        if (!cache.has(key)) {
            const timeout = () => new Promise<undefined>(resolve => setTimeout(resolve, REQUEST_TIMEOUT));
            cache.set(key, limited(() => Promise.race([request().catch(() => undefined), timeout()])));
        }
        return cache.get(key) as Promise<T | undefined>;
    };

    const snap = (value: number, step: number) => Math.round(value / step) * step;

    const forecast = (model: PointProducts, lat: number, lon: number) =>
        cached(`${model}:${lat}:${lon}`, () =>
            getPointForecastData(model, { lat, lon, step: 1 }).then(({ data }) => data.data as Forecast),
        );

    const alertsAt = (lat: number, lon: number) =>
        cached(`alerts:${lat}:${lon}`, () => getCapAlertsSummary({ lat, lon }, 'detail').then(({ data }) => data));

    const needs = (sport: SportConfig, metrics: Metric[]) => metrics.some(m => m in sport.rules);

    /** Fetches only what `sport` needs, or everything when `sport` is null. */
    const sourcesAt = async (lat: number, lon: number, sport: SportConfig | null): Promise<Sources | undefined> => {
        const wants = (metrics: Metric[]) => !sport || needs(sport, metrics);
        const [weather, waves, airq, alerts] = await Promise.all([
            forecast('ecmwf', lat, lon),
            wants(WAVE_METRICS) ? forecast('ecmwfWaves', lat, lon) : undefined,
            wants(AIRQ_METRICS) ? forecast('cams', snap(lat, AIRQ_STEP), snap(lon, AIRQ_STEP)) : undefined,
            wants(['alert']) ? alertsAt(snap(lat, ALERTS_STEP), snap(lon, ALERTS_STEP)) : undefined,
        ]);
        return weather && { weather, waves, airq, alerts };
    };

    // ---- Map of the selected sport ----

    const paint = (tile: Tile) => {
        const flag = tile.sources && evaluate(sports[sportId], conditionsAt(time, tile.sources)).flag;
        tile.shape.setStyle({ fillColor: flag ? COLORS[flag] : '#888', fillOpacity: flag ? 0.55 : 0.15 });
    };

    const refreshGrid = () => {
        const bounds = map.getBounds();
        const cells = cellsIn(bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast());
        const visible = new Set(cells.map(cell => cell.key));

        for (const [key, tile] of grid) {
            if (!visible.has(key)) {
                tile.shape.remove();
                grid.delete(key);
            }
        }

        const sport = sports[sportId];
        for (const cell of cells.filter(cell => !grid.has(cell.key))) {
            const { lat, lon, size } = cell;
            const h = size / 2;
            const corners: [number, number][] = [
                [lat - h, lon - h],
                [lat - h, lon + h],
                [lat + h, lon + h],
                [lat + h, lon - h],
            ];
            const tile: Tile = { cell, shape: L.polygon(corners, { weight: 0, interactive: false }).addTo(map) };
            grid.set(cell.key, tile);
            paint(tile);

            pending++;
            sourcesAt(lat, lon, sport).then(sources => {
                pending--;
                // The tile may have been dropped meanwhile (map moved or sport changed)
                if (grid.get(cell.key) === tile) {
                    tile.sources = sources;
                    paint(tile);
                }
            });
        }
    };

    const clearGrid = () => {
        grid.forEach(tile => tile.shape.remove());
        grid.clear();
    };

    $: sportId, clearGrid(), refreshGrid();
    $: time, grid.forEach(paint);

    // ---- Detail at a clicked point ----

    $: detail = spotSources && evaluate(sports[sportId], conditionsAt(time, spotSources));
    $: spotAlerts = activeAlerts(spotSources?.alerts ?? [], time);

    const TIMELINE_STEP = 3 * 3_600_000;
    const TIMELINE_SLOTS = 16; // 16 x 3 h = 48 h

    // flag is null after the end of the forecast
    $: timeline = spotSources
        ? Array.from({ length: TIMELINE_SLOTS }, (_, k) => {
              const slotTime = time + k * TIMELINE_STEP;
              const hasData = stepAt(spotSources!.weather.ts, slotTime) >= 0;
              return {
                  time: slotTime,
                  flag: hasData ? evaluate(sports[sportId], conditionsAt(slotTime, spotSources!)).flag : null,
              };
          })
        : [];

    const formatTime = (ts: number) =>
        new Date(ts).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });

    // ---- Legend: thresholds of the selected sport ----

    const formatRange = ([min, max]: Range) => {
        if (max === Infinity) {
            return `≥ ${min}`;
        }
        if (min === -Infinity) {
            return `≤ ${max}`;
        }
        return min === max ? `${min}` : `${min} – ${max}`;
    };

    /** Texts for the green, orange and red columns. */
    const legendCells = (metric: Metric, rule: Rule) => {
        const labels = valueLabels[metric];
        if (labels) {
            const flags: Flag[] = ['green', 'orange', 'red'];
            return flags.map(
                flag => labels.filter((_, value) => flagOf(value, rule) === flag).join(', ') || '—',
            );
        }
        return [formatRange(rule.green), formatRange(rule.orange), 'le reste'];
    };

    $: legend = (Object.entries(sports[sportId].rules) as [Metric, Rule][]).map(([metric, rule]) => ({
        metric,
        cells: legendCells(metric, rule),
    }));

    const format = (metric: Metric, value?: number) => {
        if (value === undefined) {
            return 'pas de données';
        }
        return valueLabels[metric]?.[value] ?? String(Math.round(value * 10) / 10);
    };

    const selectSpot = async ({ lat, lon }: LatLon) => {
        const request = ++spotRequest;
        spot = { lat, lon };
        spotLoading = true;
        spotError = '';

        spotMarker?.remove();
        spotMarker = new L.Marker({ lat, lng: lon }, { icon: markers.pulsatingIcon }).addTo(map);

        try {
            const sources = await sourcesAt(lat, lon, null);
            if (request !== spotRequest) {
                return; // the user clicked elsewhere meanwhile
            }
            spotSources = sources;
            spotError = sources ? '' : 'Pas de prévision à cet endroit.';
        } catch (e) {
            console.error(e);
            spotError = `Erreur : ${e}`;
        } finally {
            if (request === spotRequest) {
                spotLoading = false;
            }
        }
    };

    const onTimeChange = (ts: number) => (time = ts);

    export const onopen = (params?: LatLon) => {
        if (isValidLatLonObj(params)) {
            selectSpot({ lat: Number(params.lat), lon: Number(params.lon) });
        }
    };

    onMount(() => {
        singleclick.on(name, selectSpot);
        store.on('timestamp', onTimeChange);
        map.on('moveend', refreshGrid);
    });

    onDestroy(() => {
        singleclick.off(name, selectSpot);
        store.off('timestamp', onTimeChange);
        map.off('moveend', refreshGrid);
        clearGrid();
        spotMarker?.remove();
    });
</script>

<style lang="less">
    label {
        display: block;
    }
    select {
        width: 100%;
    }
    ul {
        list-style: none;
        padding: 0;
    }
    .sf-alert {
        padding: 4px 8px;
        border-radius: 4px;
        background: rgba(255, 133, 27, 0.15);

        small {
            display: block;
            opacity: 0.7;
        }
    }
    table {
        width: 100%;
        margin-bottom: 12px;
    }
    td:first-child {
        text-align: left;
    }
    td:nth-child(2) {
        text-align: right;
        padding: 0 8px;
    }
    .sf-legend {
        margin-top: 20px;
        padding-top: 10px;
        border-top: 1px solid rgba(255, 255, 255, 0.2);
        opacity: 0.85;

        td,
        th {
            text-align: center;
            padding: 1px 4px;
        }
        td:first-child {
            text-align: left;
        }
    }
    .sf-flag {
        padding: 4px 10px;
        border-left: 6px solid;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.05);

        &--green {
            border-color: #2ecc40;
        }
        &--orange {
            border-color: #ff851b;
        }
        &--red {
            border-color: #ff4136;
        }
    }
    .sf-dot {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;

        &--green {
            background: #2ecc40;
        }
        &--orange {
            background: #ff851b;
        }
        &--red {
            background: #ff4136;
        }
        &--none {
            background: #555;
        }
    }
    .sf-timeline {
        display: flex;
        gap: 2px;
        margin-top: 8px;

        &__slot {
            flex: 1;
            height: 18px;
            padding: 0;
            border: none;
            border-radius: 2px;
            cursor: pointer;

            &:first-child {
                outline: 2px solid white;
            }
        }
        &__labels {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
            opacity: 0.7;
        }
    }
</style>

