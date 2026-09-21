// An ordered sparse index over the existing center-cell obstacle grid.
// Querying occupied columns avoids hundreds of empty-cell lookups per hull
// step, while retaining the old x/y/z order and each bucket's insertion order.
export function indexObstacleCells(grid, cellSize) {
    const columns = new Map();
    for (const bucket of grid.values()) {
        const obstacle = bucket[0];
        const x = Math.floor(obstacle.x / cellSize);
        const y = Math.floor(obstacle.y / cellSize);
        const z = Math.floor(obstacle.z / cellSize);
        let rows = columns.get(x);
        if (!rows) columns.set(x, rows = new Map());
        let cells = rows.get(y);
        if (!cells) rows.set(y, cells = []);
        cells.push({ coordinate: z, bucket });
    }
    const sorted = entries => entries.sort((a, b) => a.coordinate - b.coordinate);
    return { grid, columns: sorted(Array.from(columns, ([coordinate, rows]) => ({
        coordinate, rows: sorted(Array.from(rows, ([coordinate, cells]) => ({
            coordinate, cells: sorted(cells),
        }))),
    }))) };
}

function lowerBound(entries, coordinate) {
    let lo = 0, hi = entries.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (entries[mid].coordinate < coordinate) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

export function visitObstacleCells(index, x0, y0, z0, x1, y1, z1, stamp, callback, stats) {
    const columns = index.columns;
    for (let x = lowerBound(columns, x0); x < columns.length && columns[x].coordinate <= x1; x++) {
        if (stats) stats.columns = (stats.columns ?? 0) + 1;
        const rows = columns[x].rows;
        for (let y = lowerBound(rows, y0); y < rows.length && rows[y].coordinate <= y1; y++) {
            if (stats) stats.rows = (stats.rows ?? 0) + 1;
            const cells = rows[y].cells;
            for (let z = lowerBound(cells, z0); z < cells.length && cells[z].coordinate <= z1; z++) {
                if (stats) stats.buckets = (stats.buckets ?? 0) + 1;
                for (const obstacle of cells[z].bucket) {
                    if (obstacle._queryStamp === stamp) continue;
                    obstacle._queryStamp = stamp;
                    callback(obstacle);
                }
            }
        }
    }
}
