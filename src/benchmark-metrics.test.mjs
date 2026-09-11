import assert from 'node:assert/strict';
import { summarizeFrames } from './benchmark-metrics.js';
assert.equal(summarizeFrames([]), null);
assert.equal(summarizeFrames(Array(120).fill(1000 / 60)).averageFps, 60);
const hitch = summarizeFrames([...Array(99).fill(10), 200], Array(100).fill(3));
assert.equal(hitch.averageFps, 84.03); // Count / total time, not mean instantaneous FPS.
assert.equal(hitch.p95Ms, 10);
assert.equal(hitch.p99Ms, 10);
assert.equal(hitch.worstMs, 200);
assert.equal(hitch.framesOver100ms, 1);
assert.equal(hitch.averageJsWorkMs, 3);
assert.equal(summarizeFrames([50, 50.1]).framesOver50ms, 1);
console.log('Benchmark metrics: empty samples, frame pacing, percentiles and hitches passed.');
