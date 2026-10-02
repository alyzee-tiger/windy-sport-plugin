import type { CapAlertHeadline } from '@windy/interfaces';
import type { AirQDataHash2, DataHash2, WavesDataHash2 } from '@windy/node-forecast-v3';

import type { Flag, Metric, Range, Rule, SportConfig } from './sports.config';

export type Conditions = Partial<Record<Metric, number>>;

/** Windy data for a point, each forecast with its own time steps. Only `weather` is required. */
export interface Sources {
    weather: Partial<DataHash2>;
    waves?: Partial<WavesDataHash2>;
    airq?: Partial<AirQDataHash2>;
    alerts?: CapAlertHeadline[];
}

export interface MetricVerdict {
    metric: Metric;
    /** undefined when the forecast has no data for it. */
    value?: number;
    flag: Flag;
}

export interface Verdict {
    flag: Flag;
    details: MetricVerdict[];
}

const SEVERITY: Flag[] = ['green', 'orange', 'red'];
const HOUR = 3_600_000;

// Codes from WeatherConditionIcon and PrecipitationType (node-forecast-v3.d.ts)
const STORM_ICONS = [14, 15, 16, 21, 23, 24];
const FOG_ICONS = [17, 22];
const ICE_PRECIP = [2, 3];

// CAP severities: moderate = yellow, severe = orange, extreme = red, unknown counted as yellow
const ALERT_LEVELS: Record<CapAlertHeadline['severity'], number> = { M: 1, A: 1, S: 2, E: 3 };

const toKmh = (ms?: number) => (ms === undefined ? undefined : ms * 3.6);
const toCelsius = (k?: number) => (k === undefined ? undefined : k - 273.15);
const isOneOf = (code: number | undefined, codes: number[]) =>
    code === undefined ? undefined : Number(codes.includes(code));

const inRange = (value: number, [min, max]: Range) => value >= min && value <= max;

const worst = (a: Flag, b: Flag): Flag => (SEVERITY.indexOf(a) >= SEVERITY.indexOf(b) ? a : b);

export const flagOf = (value: number | undefined, rule: Rule): Flag => {
    if (value === undefined) {
        return 'orange'; // never green without data
    }
    if (inRange(value, rule.green)) {
        return 'green';
    }
    return inRange(value, rule.orange) ? 'orange' : 'red';
};

/** Index of the step containing `time`, or -1 if `time` is outside the forecast. */
export function stepAt(ts: number[] = [], time: number): number {
    const next = ts.findIndex(t => t > time);
    return next > 0 ? next - 1 : -1;
}

export const activeAlerts = (alerts: CapAlertHeadline[], time: number) =>
    alerts.filter(alert => alert.start <= time && time < alert.end);

/** Reads all sources at `time` (ms) and converts Windy units (m/s, K, mm/step) to config units. */
export function conditionsAt(time: number, { weather, waves = {}, airq = {}, alerts }: Sources): Conditions {
    const i = stepAt(weather.ts, time);
    const w = stepAt(waves.ts, time);
    const a = stepAt(airq.ts, time);

    const wind = toKmh(weather.wind?.[i]);
    const gust = toKmh(weather.windGust?.[i]);
    const rain = weather.precipAmount?.[i];
    const stepHours = i >= 0 ? (weather.ts![i + 1] - weather.ts![i]) / HOUR : 1;

    return {
        wind,
        gust,
        gustSpread: wind === undefined || gust === undefined ? undefined : gust - wind,
        temp: toCelsius(weather.temperature?.[i]),
        feel: toCelsius(weather.feelTemperature?.[i]),
        rain: rain === undefined ? undefined : rain / stepHours,
        storm: isOneOf(weather.icon?.[i], STORM_ICONS),
        fog: isOneOf(weather.icon?.[i], FOG_ICONS),
        ice: isOneOf(weather.precipType?.[i], ICE_PRECIP),
        waves: waves.waves?.[w],
        wavesPeriod: waves.wavesPeriod?.[w],
        aqi: airq.aqiUs?.[a],
        pm25: airq.pm2p5?.[a],
        o3: airq.go3?.[a],
        alert: alerts && Math.max(0, ...activeAlerts(alerts, time).map(alert => ALERT_LEVELS[alert.severity] ?? 1)),
    };
}

export function evaluate(sport: SportConfig, conditions: Conditions): Verdict {
    const details = (Object.keys(sport.rules) as Metric[]).map(metric => {
        const value = conditions[metric];
        return { metric, value, flag: flagOf(value, sport.rules[metric]!) };
    });

    return { flag: details.map(d => d.flag).reduce(worst, 'green'), details };
}
