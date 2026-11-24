/**
 * Parity fixtures for the macOS app's model (01_docs/macos.md#parity): what the TypeScript code
 * computes, for the Swift tests to compare against.
 * - `tracks.json`: every circuit of `GP_TRACKS` compiled (with its pit lane), and where points
 *   round it are (`locateOnTrack`, `surfaceAt`).
 * - `puddles.json`: the puddles of a wet track.
 * - `sim-<scenario>.json`: ticks of a race (state, inputs, next state). Swift steps each recorded
 *   state once and compares: one tick at a time, so libm's last-bit differences between V8 and
 *   Darwin never pile up.
 * - `bot-plans.json`, `bot-driving.json`, `bot-laps.json`: the bots' plans, one tick of their
 *   driving in traffic (state and memory in, input and memory out), their qualifying laps.
 * - `protocol.json`: every message of the multiplayer protocol as the web sends it (`encodeMessage`),
 *   and nicknames as `checkNickname` and `nicknameKey` see them.
 *
 * Read only. Run from the repo root:
 * `node --import ./01_tools/resolveTs.ts 01_tools/swiftExport/fixtures.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BOT_PARAMS,
  botCarParams,
  botInput,
  botLapTicks,
  buildBotPlan,
  buildPitPlan,
  findCar,
  NEW_BOT_MEMORY,
  type BotMemory,
  type BotPlan,
  buildTrack,
  checkNickname,
  COLLISION_PARAMS,
  CAR_PARAMS,
  createCar,
  createGame,
  createLapState,
  DAMAGE_PARAMS,
  encodeMessage,
  forward,
  GP_TRACKS,
  headingOf,
  locateOnLoop,
  locateOnTrack,
  NEUTRAL_INPUT,
  nicknameKey,
  PIT_PARAMS,
  placePuddles,
  PROTOCOL_VERSION,
  TYRE_PARAMS,
  quantizeState,
  roadOf,
  scale,
  SLIPSTREAM_PARAMS,
  stepGame,
  sub,
  surfaceAt,
  SURFACE_PARAMS,
  add,
  dot,
  WET_PARAMS,
  wrapAngle,
  type CarState,
  type ClientMessage,
  type GameState,
  type InputCommand,
  type InputMap,
  type ServerMessage,
  type SimContext,
  type Track,
  type TrackDefinition,
} from '../../01_packages/shared/src/index.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, '04_macos/AltF1Core/Tests/AltF1CoreTests/Fixtures');
mkdirSync(OUT, { recursive: true });

const byName = (name: string): TrackDefinition => GP_TRACKS.find((d) => d.name === name)!;
const kerbCode = { none: 'n', low: 'l', high: 'h' } as const;
const runoffCode = { grass: 'g', gravel: 'v' } as const;

/** One in this many samples and walls is kept: enough to catch any difference, small enough to commit. */
const STRIDE = 7;
const every = <T>(list: readonly T[]): T[] => list.filter((_, i) => i % STRIDE === 0);

/** A compiled track: its counts, every `STRIDE`th sample and wall (exact doubles), all its kerbs. */
function trackSummary(track: Track): unknown {
  return {
    name: track.name,
    length: track.length,
    maxHalfWidth: track.maxHalfWidth,
    elevated: track.elevated,
    kerbInset: track.kerbInset,
    kerbOutset: track.kerbOutset,
    sectorStarts: track.sectorStarts,
    sampleCount: track.samples.length,
    samples: every(track.samples),
    kerbs: {
      left: track.sides.left.kerb.map((k) => kerbCode[k]).join(''),
      right: track.sides.right.kerb.map((k) => kerbCode[k]).join(''),
    },
    runoff: {
      left: track.sides.left.runoff.map((r) => runoffCode[r]).join(''),
      right: track.sides.right.runoff.map((r) => runoffCode[r]).join(''),
    },
    wallCount: track.walls.length,
    walls: every(track.walls).map((w) => [w.a.x, w.a.z, w.b.x, w.b.z, w.route, w.sample, w.progress]),
    branch: track.branch ?? null,
    pitRules: track.pitRules ?? null,
    routes: track.routes.map(trackSummary),
  };
}

/** Points round the track: on, beside and well off the asphalt, a fixed spread. */
function probes(track: Track, count: number): unknown[] {
  const out: unknown[] = [];
  for (let k = 0; k < count; k++) {
    const sample = track.samples[(k * 7919) % track.samples.length]!;
    const lateral = ((k * 37) % 81) - 40 + (k % 3) * 0.37;
    const p = add(sample.position, scale(sample.normal, lateral));
    const loc = locateOnTrack(track, p);
    out.push({
      p,
      route: loc.route,
      index: loc.index,
      distance: loc.distance,
      lateral: loc.lateral,
      halfWidth: loc.halfWidth,
      height: loc.height,
      grade: loc.grade,
      surface: surfaceAt(track, p),
    });
  }
  return out;
}

const tracks = GP_TRACKS.map((def) => {
  const track = buildTrack(def, { pitLane: true });
  return { name: def.name, track: trackSummary(track), probes: probes(track, 200) };
});
writeFileSync(join(OUT, 'tracks.json'), JSON.stringify(tracks));

const puddles = ['Monza', 'São Paulo'].map((name) => ({
  name,
  puddles: placePuddles(buildTrack(byName(name))),
}));
writeFileSync(join(OUT, 'puddles.json'), JSON.stringify(puddles));

/** How one scripted driver drives: a line beside the centreline, a top speed, a weave. */
interface Style {
  readonly offset: number;
  readonly speed: number;
  readonly weave: number;
  /** Follow the pit lane to the first box, stop there, then drive on. */
  readonly pit?: boolean;
}

function driver(car: CarState, track: Track, style: Style, tick: number): InputCommand {
  const pitRoute = track.routes.findIndex((r) => r.pit);
  const onPit = style.pit && pitRoute >= 0;
  const road = onPit ? track.routes[pitRoute]! : roadOf(track, locateOnTrack(track, car.position).route);
  const loc = locateOnLoop(road, car.position);
  const n = road.samples.length;
  const ahead = road.samples[(loc.index + 6) % n]!;
  const lateral = style.offset + style.weave * Math.sin(tick / 45);
  const target = add(ahead.position, scale(ahead.normal, lateral));
  const error = wrapAngle(headingOf(sub(target, car.position)) - car.heading);
  let bend = 0;
  for (let k = 0; k < 40; k++) bend = Math.max(bend, Math.abs(road.samples[(loc.index + k) % n]!.curvature));
  let wanted = Math.min(style.speed, Math.sqrt(22 / Math.max(bend, 1e-4)));
  if (onPit && road.pitRules) {
    const box = road.pitRules.boxes[0]!;
    const toBox = box - loc.distance;
    if (car.pitStop) wanted = 20;
    else if (toBox > -5 && toBox < 45) wanted = 3;
    else wanted = Math.min(wanted, 18);
  }
  const speed = dot(car.velocity, forward(car.heading));
  return {
    ...NEUTRAL_INPUT,
    steer: Math.max(-1, Math.min(1, -error * 2.5)),
    throttle: speed < wanted ? 1 : 0,
    brake: speed > wanted + 3 ? 1 : 0,
  };
}

interface Scenario {
  readonly name: string;
  readonly circuit: string;
  readonly pitLane: boolean;
  readonly damage: boolean;
  readonly rain: boolean;
  /** Tyre compounds and wear; the car stopped in its box fits softs. */
  readonly tyres?: boolean;
  readonly ticks: number;
  readonly styles: Readonly<Record<string, Style>>;
  /** Ticks at which a car asks for a reset. */
  readonly resets?: readonly (readonly [number, string])[];
}

const SCENARIOS: readonly Scenario[] = [
  {
    name: 'monza',
    circuit: 'Monza',
    pitLane: false,
    damage: false,
    rain: false,
    ticks: 7800,
    styles: {
      // b follows a on its line, faster: it runs into a's tail.
      a: { offset: -2, speed: 80, weave: 0 },
      b: { offset: -2, speed: 88, weave: 1 },
      c: { offset: 0, speed: 90, weave: 6 },
      d: { offset: 0, speed: 70, weave: 16 },
    },
    resets: [[2400, 'd']],
  },
  {
    name: 'monaco',
    circuit: 'Monaco',
    pitLane: true,
    damage: true,
    rain: false,
    tyres: true,
    ticks: 1800,
    styles: {
      a: { offset: 0, speed: 60, weave: 3 },
      b: { offset: 1, speed: 70, weave: 9 },
      p: { offset: 0, speed: 20, weave: 0, pit: true },
    },
  },
  {
    name: 'saoPaulo',
    circuit: 'São Paulo',
    pitLane: true,
    damage: true,
    rain: true,
    tyres: true,
    ticks: 2400,
    styles: {
      a: { offset: -1, speed: 75, weave: 2 },
      b: { offset: 1, speed: 80, weave: 7 },
      c: { offset: 0, speed: 85, weave: 12 },
    },
  },
];

for (const scenario of SCENARIOS) {
  const track = buildTrack(byName(scenario.circuit), { pitLane: scenario.pitLane });
  const ids = Object.keys(scenario.styles);
  const gridIds = ids.filter((id) => !scenario.styles[id]!.pit);
  let state: GameState = createGame(track, gridIds);
  const pitId = ids.find((id) => scenario.styles[id]!.pit);
  if (pitId) {
    // The pit car starts in the lane, 80 m before the first box.
    const lane = track.routes.find((r) => r.pit)!;
    const at = lane.pitRules!.boxes[0]! - 80;
    const sample = lane.samples.find((s) => s.distance >= at)!;
    const car = createCar({ id: pitId, position: sample.position, heading: headingOf(sample.tangent) });
    const cars = [...state.cars, car].sort((a, b) => (a.id < b.id ? -1 : 1));
    const laps = cars.map(
      (c) =>
        state.laps.find((l) => l.carId === c.id) ??
        createLapState(c.id, locateOnTrack(track, c.position).distance),
    );
    state = { ...state, cars, laps };
  }
  const ctx: SimContext = {
    track,
    carParams: CAR_PARAMS,
    surfaceParams: SURFACE_PARAMS,
    collisionParams: COLLISION_PARAMS,
    slipstreamParams: SLIPSTREAM_PARAMS,
    ...(scenario.damage ? { damage: DAMAGE_PARAMS } : {}),
    ...(scenario.pitLane
      ? {
          // The pit car gets the first box (its driver aims there), the others the next ones.
          pit: {
            params: PIT_PARAMS,
            boxes: Object.fromEntries(
              [...ids].sort((x, y) => Number(!scenario.styles[x]!.pit) - Number(!scenario.styles[y]!.pit))
                .map((id, i) => [id, i]),
            ),
          },
        }
      : {}),
    ...(scenario.rain ? { weather: { params: WET_PARAMS, puddles: placePuddles(track) } } : {}),
    ...(scenario.tyres ? { tyres: TYRE_PARAMS } : {}),
  };
  const steps: unknown[] = [];
  let pitEvents = 0;
  let impactTicks = 0;
  for (let t = 0; t < scenario.ticks; t++) {
    const inputs: Record<string, InputCommand> = {};
    for (const car of state.cars) {
      const reset = scenario.resets?.some(([tick, id]) => tick === t && id === car.id) ?? false;
      // Stopped in its box: softs (the choice is the driver's, keys 1 / 2).
      const boxed = scenario.tyres && car.pitStop && t < car.pitStop.until && car.tyres?.compound !== 'soft';
      inputs[car.id] = { ...driver(car, track, scenario.styles[car.id]!, t), reset, ...(boxed && { compound: 'soft' as const }) };
    }
    const next = stepGame(state, inputs as InputMap, ctx);
    const lapEvent = next.laps.some(
      (lap, i) => lap.sector !== state.laps[i]!.sector || lap.laps !== state.laps[i]!.laps,
    );
    // A stop starting, ending (the car repaired) or forgotten (the car out of the lane).
    const pitEvent = next.cars.some(
      (car, i) =>
        (car.pitStop === undefined) !== (state.cars[i]!.pitStop === undefined) ||
        car.pitStop?.until === next.tick,
    );
    const reset = Object.values(inputs).some((i) => i.reset || i.compound !== undefined);
    if (pitEvent) pitEvents++;
    if (next.impacts.length > 0) impactTicks++;
    if (t % 30 === 0 || lapEvent || pitEvent || reset || (next.impacts.length > 0 && t % 4 === 0)) {
      steps.push({ state, inputs, next });
    }
    state = next;
  }
  const out = {
    circuit: scenario.circuit,
    pitLane: scenario.pitLane,
    damage: scenario.damage,
    rain: scenario.rain,
    tyres: scenario.tyres ?? false,
    boxes: ctx.pit?.boxes ?? null,
    steps,
  };
  writeFileSync(join(OUT, `sim-${scenario.name}.json`), JSON.stringify(out));
  const laps = state.laps.map((l) => `${l.carId}:${l.laps}/${l.sector}`).join(' ');
  console.log(`${scenario.name}: ${steps.length} steps kept, ${pitEvents} pit events, ${impactTicks} ticks with impacts, laps ${laps}`);
}
console.log(`Fixtures written to ${OUT}`);

// ---- Bots (X.4): plans, one tick of driving in traffic, qualifying laps.

const LEVELS = ['easy', 'medium', 'hard'] as const;

/** Every circuit's plans: racing line and speeds (every `STRIDE`th sample), per level and the pit plan. */
const plans = ['Monza', 'Monaco'].map((name) => {
  const track = buildTrack(byName(name), { pitLane: true });
  const summary = (plan: BotPlan): unknown => ({
    road: plan.road.name,
    count: plan.lateral.length,
    lateral: every(plan.lateral),
    speed: every(plan.speed),
  });
  return {
    name,
    race: Object.fromEntries(
      LEVELS.map((level) => [level, summary(buildBotPlan(track, CAR_PARAMS, BOT_PARAMS[level]))]),
    ),
    pit: summary(buildPitPlan(track, CAR_PARAMS, BOT_PARAMS.medium, 2, PIT_PARAMS)),
  };
});
writeFileSync(join(OUT, 'bot-plans.json'), JSON.stringify(plans));

/**
 * Five bots racing in traffic on São Paulo (one on its pit plan): every 20th tick, each bot's
 * state, plan and memory in, input and memory out.
 */
{
  const track = buildTrack(byName('São Paulo'), { pitLane: true });
  const bots = [
    { id: 'a', level: 'hard', pit: false },
    { id: 'b', level: 'hard', pit: false },
    { id: 'c', level: 'medium', pit: true },
    { id: 'd', level: 'medium', pit: false },
    { id: 'e', level: 'easy', pit: false },
  ] as const;
  const planOf = (bot: (typeof bots)[number]): BotPlan =>
    bot.pit
      ? buildPitPlan(track, CAR_PARAMS, BOT_PARAMS[bot.level], 1, PIT_PARAMS)
      : buildBotPlan(track, CAR_PARAMS, BOT_PARAMS[bot.level]);
  const botPlans = bots.map(planOf);
  const ctx: SimContext = {
    track,
    carParams: CAR_PARAMS,
    carParamsById: Object.fromEntries(
      bots.map((b) => [b.id, botCarParams(CAR_PARAMS, BOT_PARAMS[b.level])]),
    ),
    surfaceParams: SURFACE_PARAMS,
    collisionParams: COLLISION_PARAMS,
    slipstreamParams: SLIPSTREAM_PARAMS,
    pit: { params: PIT_PARAMS, boxes: { c: 1 } },
  };
  let state = createGame(track, bots.map((b) => b.id));
  const memories: Record<string, BotMemory> = Object.fromEntries(bots.map((b) => [b.id, NEW_BOT_MEMORY]));
  const steps: unknown[] = [];
  for (let t = 0; t < 4200; t++) {
    const inputs: Record<string, InputCommand> = {};
    const record: unknown[] = [];
    bots.forEach((bot, i) => {
      const car = findCar(state, bot.id)!;
      const result = botInput(car, botPlans[i]!, memories[bot.id]!, state.cars);
      if (t % 20 === 0) {
        record.push({ id: bot.id, level: bot.level, pit: bot.pit, memory: memories[bot.id], input: result.input, next: result.memory });
      }
      memories[bot.id] = result.memory;
      inputs[bot.id] = result.input;
    });
    if (record.length > 0) steps.push({ state, bots: record });
    state = stepGame(state, inputs as InputMap, ctx);
  }
  writeFileSync(join(OUT, 'bot-driving.json'), JSON.stringify({ circuit: 'São Paulo', steps }));
  const stops = state.cars.filter((c) => c.pitStop).length;
  console.log(`bot driving: ${steps.length} steps, laps ${state.laps.map((l) => l.laps).join('/')}, in a stop ${stops}`);
}

/** The bots' qualifying laps on Monza. */
{
  const track = buildTrack(byName('Monza'));
  const ctx: SimContext = {
    track,
    carParams: CAR_PARAMS,
    surfaceParams: SURFACE_PARAMS,
    collisionParams: COLLISION_PARAMS,
    slipstreamParams: SLIPSTREAM_PARAMS,
  };
  const laps = Object.fromEntries(LEVELS.map((level) => [level, botLapTicks(ctx, level)]));
  writeFileSync(join(OUT, 'bot-laps.json'), JSON.stringify({ circuit: 'Monza', laps }));
  console.log('bot laps', laps);
}

/** The multiplayer protocol: every message as the web encodes it, and the nickname rules. */
{
  const track = buildTrack(byName('Monza'));
  const ctx: SimContext = {
    track,
    carParams: CAR_PARAMS,
    surfaceParams: SURFACE_PARAMS,
    collisionParams: COLLISION_PARAMS,
    slipstreamParams: SLIPSTREAM_PARAMS,
  };
  const drive: InputCommand = { throttle: 1, brake: 0, reverse: 0, steer: 0.25, reset: false };
  let state = createGame(track, ['p1', 'p2']);
  for (let t = 0; t < 90; t++) state = stepGame(state, { p1: drive, p2: NEUTRAL_INPUT }, ctx);
  const client: ClientMessage[] = [
    { type: 'hello', protocol: PROTOCOL_VERSION, nickname: 'Enea' },
    { type: 'enter', mode: 'grandPrix', track: 'São Paulo' },
    { type: 'input', seq: 4321, input: drive },
    { type: 'input', seq: 4322, input: { ...NEUTRAL_INPUT, compound: 'soft' } },
    { type: 'ping', t: 1234.5 },
    { type: 'gp', action: 'start' },
    { type: 'gp', action: 'weather', weather: 'rain' },
    { type: 'gp', action: 'endQualifying' },
    { type: 'gp', action: 'startRace', laps: 12 },
    { type: 'gp', action: 'endRace' },
    { type: 'gp', action: 'playAgain' },
  ];
  const players = [
    { id: 'p1', nickname: 'Enea', livery: 0 },
    { id: 'p2', nickname: 'Zoë', livery: 3 },
  ];
  const server: ServerMessage[] = [
    {
      type: 'welcome',
      playerId: 'p1',
      rooms: [
        { mode: 'practice', track: 'Monza', players: 0, status: 'open' },
        { mode: 'grandPrix', track: 'São Paulo', players: 2, status: 'running' },
      ],
      records: [
        { mode: 'grandPrix', track: 'Monza', records: [{ nickname: 'Zoë', ticks: 4810, setAt: '2026-11-20T18:04:11.000Z' }] },
        { mode: 'grandPrix', track: 'Monaco', records: [] },
      ],
    },
    { type: 'rejected', reason: 'taken' },
    { type: 'refused', reason: 'inProgress' },
    { type: 'entered', track: 'Monza', players },
    { type: 'players', players },
    {
      type: 'snapshot',
      state: quantizeState(state),
      acks: { p1: 88 },
      inputs: { p1: drive },
    },
    { type: 'pong', t: 1234.5 },
    {
      type: 'grandPrix',
      phase: 'race',
      manager: 'p1',
      drivers: ['p1', 'p2'],
      qualifying: [
        { id: 'p1', best: 4800, setAt: 9000, laps: 3, done: true },
        { id: 'p2', best: null, setAt: null, laps: 1, done: true },
      ],
      race: [
        { id: 'p1', name: 'Enea', status: 'running', laps: 2, time: null, gap: null, lapsBehind: 0, best: 4790, stops: 1, penalty: 0 },
        { id: 'p2', name: 'Zoë', status: 'dnf', laps: 1, time: null, gap: null, lapsBehind: 1, best: null, stops: 0, penalty: 0 },
      ],
      raceLaps: 8,
      hold: { lightsFrom: 12000, until: 12276 },
      boxes: { p1: 0, p2: 1 },
      weather: 'dry',
      sectorBests: [1500, null, 1620],
    },
    {
      type: 'grandPrix',
      phase: 'lobby',
      manager: null,
      drivers: [],
      qualifying: [],
      race: [],
      raceLaps: null,
      hold: null,
      boxes: {},
      weather: 'rain',
      sectorBests: [null, null, null],
    },
  ];
  const names = ['Enea', '  Max   Power  ', 'ab', 'Zoë_09-x', 'Ünal', 'e\u0301lise', 'a!b', 'abcdefghijklmnopq', 'ENEA', '名前です'];
  const nicknames = names.map((raw) => ({ raw, check: checkNickname(raw), key: nicknameKey(raw) }));
  writeFileSync(
    join(OUT, 'protocol.json'),
    JSON.stringify({
      version: PROTOCOL_VERSION,
      client: client.map(encodeMessage),
      server: server.map(encodeMessage),
      nicknames,
    }),
  );
  console.log(`protocol: ${client.length} client, ${server.length} server messages, ${nicknames.length} nicknames`);
}
