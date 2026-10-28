import type { CarId, CarState, Track } from '@altf1/shared';
import { trackBounds } from '../scenery/placement';
import { fitToCanvas, type MapPoint } from './minimapFit';
import './hud.css';

/** Canvas size and the room kept clear round the track (px). */
const SIZE = 180;
const PADDING = 12;
const DOT = 4;
const OWN_DOT = 6;
const ROAD = '#d8d8de';
const START = '#e10600';

/** How a car is shown: its livery colour and its driver's name. */
export interface MapPlayer {
  readonly name: string;
  readonly color: string;
}

/**
 * Bottom-left map of the whole track seen from above, a dot per car in its livery colour (the own
 * car bigger, ringed white) and a legend colour → name of the cars on track. Reads state only.
 */
export class Minimap {
  private readonly root = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly legend = document.createElement('ul');
  private readonly context: CanvasRenderingContext2D | null;
  private readonly background: HTMLCanvasElement;
  private readonly toMap: (x: number, z: number) => MapPoint;
  private players: Readonly<Record<CarId, MapPlayer>> = {};
  /** The cars the legend shows, to rebuild it only when they change. */
  private legendKey = '';

  constructor(track: Track) {
    const ratio = window.devicePixelRatio || 1;
    this.toMap = fitToCanvas(trackBounds(track), SIZE, PADDING);
    this.root.className = 'minimap';
    this.legend.className = 'minimap-legend';
    this.canvas.width = this.canvas.height = SIZE * ratio;
    this.canvas.style.width = this.canvas.style.height = `${SIZE}px`;
    this.context = this.canvas.getContext('2d');
    this.context?.scale(ratio, ratio);
    this.background = this.drawTrack(track, ratio);
    this.root.append(this.canvas, this.legend);
    document.body.appendChild(this.root);
  }

  /** Names and colours by car id (cars without one are drawn grey, out of the legend). */
  setPlayers(players: Readonly<Record<CarId, MapPlayer>>): void {
    this.players = players;
    this.legendKey = '';
  }

  /** Call once per rendered frame with the cars to show. */
  update(cars: readonly CarState[], ownId: CarId): void {
    this.updateLegend(cars);
    const ctx = this.context;
    if (!ctx) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(this.background, 0, 0, SIZE, SIZE);
    // The own car last, on top of the others.
    const order = [...cars].sort((a, b) => Number(a.id === ownId) - Number(b.id === ownId));
    for (const car of order) {
      const own = car.id === ownId;
      const p = this.toMap(car.position.x, car.position.z);
      ctx.beginPath();
      ctx.arc(p.u, p.v, own ? OWN_DOT : DOT, 0, Math.PI * 2);
      ctx.fillStyle = this.players[car.id]?.color ?? '#8a8a8a';
      ctx.fill();
      ctx.lineWidth = own ? 2 : 1;
      ctx.strokeStyle = own ? '#ffffff' : 'rgba(0, 0, 0, 0.6)';
      ctx.stroke();
    }
  }

  /** The track (main loop and branches) and a start-line tick, drawn once. */
  private drawTrack(track: Track, ratio: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE * ratio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.scale(ratio, ratio);
    const scale = this.toMap(1, 0).u - this.toMap(0, 0).u;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.strokeStyle = ROAD;
    for (const [i, road] of [track, ...track.routes].entries()) {
      const points = road.samples.map((s) => this.toMap(s.position.x, s.position.z));
      ctx.beginPath();
      points.forEach((p, k) => (k === 0 ? ctx.moveTo(p.u, p.v) : ctx.lineTo(p.u, p.v)));
      if (i === 0) ctx.closePath();
      ctx.lineWidth = Math.max(3, 2 * road.maxHalfWidth * scale);
      ctx.stroke();
    }
    const start = track.samples[0]!;
    const half = start.halfWidth + 4;
    const a = this.toMap(
      start.position.x + start.normal.x * half,
      start.position.z + start.normal.z * half,
    );
    const b = this.toMap(
      start.position.x - start.normal.x * half,
      start.position.z - start.normal.z * half,
    );
    ctx.beginPath();
    ctx.moveTo(a.u, a.v);
    ctx.lineTo(b.u, b.v);
    ctx.lineWidth = 3;
    ctx.strokeStyle = START;
    ctx.stroke();
    return canvas;
  }

  private updateLegend(cars: readonly CarState[]): void {
    const shown = cars.filter((car) => this.players[car.id]);
    const key = shown.map((car) => car.id).join('\n');
    if (key === this.legendKey) return;
    this.legendKey = key;
    this.legend.replaceChildren(
      ...shown.map((car) => {
        const player = this.players[car.id]!;
        const row = document.createElement('li');
        const swatch = document.createElement('i');
        swatch.className = 'minimap-swatch';
        swatch.style.background = player.color;
        row.append(swatch, player.name);
        return row;
      }),
    );
  }
}
