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
    return { grid, cellSize, columns: sorted(Array.from(columns, ([coordinate, rows]) => ({
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

function outsideCell(position, reach, coordinate, size) {
    return position + reach < coordinate * size || position - reach > (coordinate + 1) * size;
}

export function visitObstacleCells(index, x0, y0, z0, x1, y1, z1, stamp, callback, stats, position, reach) {
    const columns = index.columns;
    for (let x = lowerBound(columns, x0); x < columns.length && columns[x].coordinate <= x1; x++) {
        if (stats) stats.columns = (stats.columns ?? 0) + 1;
        // A contact can move the hull during the callback. Check its live
        // position at each level so multi-contact responses retain their order.
        if (position && outsideCell(position.x, reach, columns[x].coordinate, index.cellSize)) continue;
        const rows = columns[x].rows;
        for (let y = lowerBound(rows, y0); y < rows.length && rows[y].coordinate <= y1; y++) {
            if (stats) stats.rows = (stats.rows ?? 0) + 1;
            if (position && outsideCell(position.y, reach, rows[y].coordinate, index.cellSize)) continue;
            const cells = rows[y].cells;
            for (let z = lowerBound(cells, z0); z < cells.length && cells[z].coordinate <= z1; z++) {
                if (stats) stats.buckets = (stats.buckets ?? 0) + 1;
                if (position && outsideCell(position.z, reach, cells[z].coordinate, index.cellSize)) continue;
                for (const obstacle of cells[z].bucket) {
                    if (obstacle._queryStamp === stamp) continue;
                    obstacle._queryStamp = stamp;
                    callback(obstacle);
                }
            }
        }
    }
}

// Weapon rays can touch any cell inside the obstacle's full corner reach.
export function addObstacleToSegmentGrid(grid, obstacle, size, cellKey, keys, ordered = false) {
    const reach = Math.max(obstacle.radius, obstacle.losRadius ?? obstacle.radius);
    const x0 = Math.floor((obstacle.x - reach) / size), x1 = Math.floor((obstacle.x + reach) / size);
    const y0 = Math.floor((obstacle.y - reach) / size), y1 = Math.floor((obstacle.y + reach) / size);
    const z0 = Math.floor((obstacle.z - reach) / size), z1 = Math.floor((obstacle.z + reach) / size);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        const key = cellKey(x, y, z);
        if (ordered) addOrderedObstacle(grid, key, obstacle);
        else {
            let bucket = grid.get(key);
            if (!bucket) grid.set(key, bucket = []);
            bucket.push(obstacle);
        }
        keys?.push(key);
    }
}

export function removeObstacleFromCell(grid, key, obstacle) {
    const bucket = grid.get(key);
    if (bucket.length === 1) grid.delete(key);
    else bucket.splice(bucket.indexOf(obstacle), 1);
}

export function addOrderedObstacle(grid, key, obstacle) {
    let bucket = grid.get(key);
    if (!bucket) grid.set(key, bucket = []);
    // The order of contacts and equal-distance hits matches a fresh index.
    let i = bucket.length;
    while (i > 0 && bucket[i - 1]._gridOrder > obstacle._gridOrder) i--;
    bucket.splice(i, 0, obstacle);
}
