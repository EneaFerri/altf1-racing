import * as THREE from 'three';
import type { Track, TrackSample } from '@altf1/shared';
import { createConcreteTexture } from '../pixelTexture';
import { surfaceBetween } from '../ribbon';

// A road tunnel over the track (Monaco's, under the Fairmont): view only, the physics is unchanged.

/** Inner height (m), and how far past the run-off the inner walls stand (m). */
const INNER_HEIGHT = 6.5;
const WALL_GAP = 0.3;
/** Thickness of the side walls (m). */
const THICKNESS = 1.5;
/** Ceiling lights: one every this many metres, their size (m). */
const LIGHT_EVERY = 6;
const LIGHT_SIZE = new THREE.Vector3(0.5, 0.15, 2.4);
const CONCRETE_TILE = 3;

/** The lap fractions a tunnel covers (driving order) and its roof's top (m). */
export interface TunnelSpan {
  readonly from: number;
  readonly to: number;
  readonly height: number;
}

/**
 * Side walls past the run-off, a roof slab over the whole width (its top at `span.height`: the
 * buildings over the tunnel stand there), portals at both ends and a row of glowing ceiling lights.
 */
export function createTunnel(track: Track, span: TunnelSpan): THREE.Group {
  const samples = samplesIn(track, span);
  const group = new THREE.Group();
  if (samples.length < 2) return group;
  const inside = new THREE.MeshLambertMaterial({
    map: createConcreteTexture(),
    color: '#8d9096',
    side: THREE.DoubleSide,
  });
  const outside = new THREE.MeshLambertMaterial({
    map: createConcreteTexture(),
    side: THREE.DoubleSide,
  });
  /** Points at `offset` m to the right of the centreline (negative: left), at height `y`. */
  const edge = (offset: (s: TrackSample) => number, y: number): THREE.Vector3[] =>
    samples.map((s) => {
      const o = offset(s);
      return new THREE.Vector3(s.position.x + s.normal.x * o, y, s.position.z + s.normal.z * o);
    });
  const inner = (k: 1 | -1) => (s: TrackSample) => k * (s.halfWidth + track.runoffWidth + WALL_GAP);
  const outer = (k: 1 | -1) => (s: TrackSample) => inner(k)(s) + k * THICKNESS;
  const top = span.height;

  for (const k of [1, -1] as const) {
    group.add(
      surfaceBetween(edge(inner(k), 0), edge(inner(k), INNER_HEIGHT), inside, CONCRETE_TILE),
      surfaceBetween(edge(outer(k), 0), edge(outer(k), top), outside, CONCRETE_TILE),
    );
  }
  group.add(
    // Ceiling, roof top.
    surfaceBetween(
      edge(inner(-1), INNER_HEIGHT),
      edge(inner(1), INNER_HEIGHT),
      inside,
      CONCRETE_TILE,
    ),
    surfaceBetween(edge(outer(-1), top), edge(outer(1), top), outside, CONCRETE_TILE),
  );
  // Portals: the wall and roof ends at both mouths.
  for (const s of [samples[0]!, samples[samples.length - 1]!]) {
    const at = (o: number, y: number): THREE.Vector3 =>
      new THREE.Vector3(s.position.x + s.normal.x * o, y, s.position.z + s.normal.z * o);
    for (const k of [1, -1] as const) {
      group.add(
        surfaceBetween(
          [at(inner(k)(s), 0), at(inner(k)(s), top)],
          [at(outer(k)(s), 0), at(outer(k)(s), top)],
          outside,
          CONCRETE_TILE,
        ),
      );
    }
    group.add(
      surfaceBetween(
        [at(inner(-1)(s), INNER_HEIGHT), at(inner(1)(s), INNER_HEIGHT)],
        [at(inner(-1)(s), top), at(inner(1)(s), top)],
        outside,
        CONCRETE_TILE,
      ),
    );
  }
  group.add(ceilingLights(samples));
  return group;
}

/** The main loop's samples within the span, in driving order (across the line if it wraps). */
function samplesIn(track: Track, span: TunnelSpan): TrackSample[] {
  const n = track.samples.length;
  const at = (i: number): number => track.samples[i]!.distance / track.length;
  const inSpan = (i: number): boolean =>
    span.from <= span.to
      ? at(i) >= span.from && at(i) <= span.to
      : at(i) >= span.from || at(i) <= span.to;
  const first = track.samples.findIndex((_, i) => inSpan(i) && !inSpan((i - 1 + n) % n));
  if (first < 0) return [];
  const out: TrackSample[] = [];
  for (let k = 0; k < n && inSpan((first + k) % n); k++) out.push(track.samples[(first + k) % n]!);
  return out;
}

/** Glowing strip lights under the ceiling, down the middle (unlit material: they shine). */
function ceilingLights(samples: readonly TrackSample[]): THREE.InstancedMesh {
  const spots = samples.filter(
    (s, i) =>
      i === 0 ||
      Math.floor(s.distance / LIGHT_EVERY) !== Math.floor(samples[i - 1]!.distance / LIGHT_EVERY),
  );
  const lights = new THREE.InstancedMesh(
    new THREE.BoxGeometry(LIGHT_SIZE.x, LIGHT_SIZE.y, LIGHT_SIZE.z),
    new THREE.MeshBasicMaterial({ color: '#ffd9a0' }),
    spots.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spots.forEach((s, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(s.tangent.x, s.tangent.z));
    m.compose(
      new THREE.Vector3(s.position.x, INNER_HEIGHT - 0.1, s.position.z),
      q,
      new THREE.Vector3(1, 1, 1),
    );
    lights.setMatrixAt(i, m);
  });
  return lights;
}
