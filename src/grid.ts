export interface Cell {
    key: string;
    /** Center of the cell. */
    lat: number;
    lon: number;
    /** Side length in degrees. */
    size: number;
}

/** ECMWF resolution is ~0.1°: smaller cells would only repeat the same forecast. */
const MIN_SIZE = 1 / 8;

/**
 * Square cells covering the given bounds, about `across` cells wide.
 * Sizes are powers of two and positions are snapped, so panning reuses the same cells (and their cached forecasts).
 */
export function cellsIn(south: number, west: number, north: number, east: number, across = 32): Cell[] {
    const size = Math.max(MIN_SIZE, 2 ** Math.round(Math.log2((east - west) / across)));
    const cells: Cell[] = [];

    for (let lat = Math.floor(south / size) * size; lat < north; lat += size) {
        for (let lon = Math.floor(west / size) * size; lon < east; lon += size) {
            const center = { lat: lat + size / 2, lon: lon + size / 2 };
            cells.push({ key: `${center.lat}:${center.lon}`, ...center, size });
        }
    }
    return cells;
}
