// Plain JS so Node (>= 23) runs it directly: it strips the TS types of the imported files.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { conditionsAt, evaluate, stepAt } from '../src/flags.ts';
import { cellsIn } from '../src/grid.ts';
import { sports } from '../src/sports.config.ts';

const H = 3_600_000;

test('kitesurf: good wind is green', () => {
    const verdict = evaluate(sports.kitesurf, { wind: 30, gust: 40, temp: 20, storm: 0, fog: 0, alert: 0 });
    assert.equal(verdict.flag, 'green');
});

test('kitesurf: light wind is orange, with the detail per metric', () => {
    const verdict = evaluate(sports.kitesurf, { wind: 20, gust: 25, temp: 20, storm: 0, fog: 0, alert: 0 });
    assert.equal(verdict.flag, 'orange');
    assert.deepEqual(verdict.details, [
        { metric: 'alert', value: 0, flag: 'green' },
        { metric: 'wind', value: 20, flag: 'orange' },
        { metric: 'gust', value: 25, flag: 'green' },
        { metric: 'temp', value: 20, flag: 'green' },
        { metric: 'storm', value: 0, flag: 'green' },
        { metric: 'fog', value: 0, flag: 'green' },
    ]);
});

test('storm is red', () => {
    assert.equal(evaluate(sports.course, { feel: 15, storm: 1 }).flag, 'red');
});

test('fog is red for bikes, orange for hikers', () => {
    assert.equal(evaluate(sports.velo, { fog: 1 }).flag, 'red');
    assert.equal(evaluate(sports.rando, { gust: 10, rain: 0, feel: 15, storm: 0, fog: 1, ice: 0, alert: 0 }).flag, 'orange');
});

test('missing data is orange, never green', () => {
    const verdict = evaluate(sports.paddle, { wind: 5, storm: 0, fog: 0, alert: 0 });
    assert.equal(verdict.flag, 'orange');
    assert.deepEqual(verdict.details.find(d => d.metric === 'waves'), { metric: 'waves', value: undefined, flag: 'orange' });
});

test('stepAt finds the step containing the time', () => {
    const ts = [0, H, 2 * H];
    assert.equal(stepAt(ts, 0), 0);
    assert.equal(stepAt(ts, 1.5 * H), 1);
    assert.equal(stepAt(ts, -1), -1);
    assert.equal(stepAt(ts, 5 * H), -1);
});

test('cellsIn covers the view with snapped cells, so panning reuses them', () => {
    const cells = cellsIn(41.5, -13.6, 55.2, 18.2);
    assert.deepEqual(cells[0], { key: '41.5:-13.5', lat: 41.5, lon: -13.5, size: 1 });

    const panned = cellsIn(41.5, -12, 55.2, 19.8).map(c => c.key);
    assert.ok(panned.includes('41.5:-11.5'));
    assert.ok(cells.some(c => c.key === '41.5:-11.5'));
});

test('cellsIn never goes below the model resolution', () => {
    assert.equal(cellsIn(45, 5, 45.1, 5.1)[0].size, 1 / 8);
});

test('conditionsAt converts Windy units and aligns each source on time', () => {
    const weather = {
        ts: [0, 3 * H, 6 * H],
        wind: [10, 10, 10],
        windGust: [15, 15, 15],
        temperature: [293.15, 293.15, 293.15],
        precipAmount: [0, 6, 0],
        icon: [1, 24, 1],
        precipType: [0, 2, 0],
    };
    const airq = { ts: [0, H, 2 * H, 3 * H, 4 * H], aqiUs: [1, 2, 3, 42, 5], go3: [0, 0, 0, 90, 0] };

    const c = conditionsAt(3.5 * H, { weather, airq });

    assert.equal(c.wind, 36);
    assert.equal(c.gustSpread, 18);
    assert.equal(Math.round(c.temp), 20);
    assert.equal(c.rain, 2); // 6 mm over a 3 h step
    assert.equal(c.storm, 1);
    assert.equal(c.ice, 1);
    assert.equal(c.fog, 0);
    assert.equal(c.aqi, 42);
    assert.equal(c.o3, 90);
    assert.equal(c.waves, undefined);
    assert.equal(c.alert, undefined);
});

test('official alerts: level of the worst alert active at that time', () => {
    const weather = { ts: [0, 3 * H] };
    const alerts = [
        { start: 0, end: 2 * H, severity: 'M' },
        { start: H, end: 2 * H, severity: 'S' },
    ];

    assert.equal(conditionsAt(0.5 * H, { weather, alerts }).alert, 1);
    assert.equal(conditionsAt(1.5 * H, { weather, alerts }).alert, 2);
    assert.equal(conditionsAt(2.5 * H, { weather, alerts }).alert, 0);
    assert.equal(conditionsAt(0.5 * H, { weather, alerts: [] }).alert, 0);
});

test('official alerts: yellow is orange, orange or red is red', () => {
    const flagFor = alert => evaluate({ rules: { alert: sports.velo.rules.alert } }, { alert }).flag;
    assert.deepEqual([0, 1, 2, 3].map(flagFor), ['green', 'orange', 'red', 'red']);
});
