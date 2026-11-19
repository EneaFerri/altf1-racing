import { describe, expect, it } from 'vitest';
import { botLapTicks } from '../ai/lapTime';
import { BotSquad } from '../ai/squad';
import { BOT_PARAMS, type BotLevel } from '../config/bot';
import { CAR_PARAMS } from '../config/car';
import { TICK_RATE } from '../config/sim';
import { botCarParams } from '../ai/plan';
import { MONZA } from '../track/layouts';
import { GrandPrix } from './GrandPrix';
import { OfflineRoom } from './OfflineRoom';
import { squadBots, teamBoxes, teamLineup } from './teams';

describe('single-player Grand Prix, headless (S.5)', () => {
  it(
    '10 cars race 4 laps of Monza: everyone finishes, every one makes its stop',
    { timeout: 120_000 },
    () => {
      // The player's seat driven by a Medium bot too, so the race runs on its own.
      const seats = teamLineup('polimi', () => 0).map((seat) =>
        seat.kind === 'player' ? { ...seat, kind: 'medium' as BotLevel } : seat,
      );
      const params = Object.fromEntries(
        seats.map((s) => [s.id, botCarParams(CAR_PARAMS, BOT_PARAMS[s.kind as BotLevel])]),
      );
      const room = new OfflineRoom(MONZA, params, teamBoxes(seats));
      const lapOf = new Map<BotLevel, number>();
      for (const level of ['hard', 'medium'] as const) {
        lapOf.set(level, botLapTicks(room.sim, level)!);
      }
      expect(lapOf.get('hard')! / TICK_RATE).toBeCloseTo(78.5, 0); // the calibrated pole, near
      const gp = new GrandPrix(room, () => 0.5);
      const [manager, ...rest] = seats;
      gp.add(manager!.id, manager!.name);
      rest.forEach((s, i) => gp.addSimulated(s.id, s.name, lapOf.get(s.kind as BotLevel)! + i));
      gp.command(manager!.id, { action: 'start' });
      gp.command(manager!.id, { action: 'endQualifying' });
      expect(gp.info.phase).toBe('grid');
      const squad = new BotSquad(room.track, squadBots(seats));
      squad.setRace(4);
      gp.command(manager!.id, { action: 'startRace', laps: 4 });
      for (let tick = 0; tick < 4 * 120 * TICK_RATE && gp.info.phase === 'race'; tick++) {
        room.step(squad.inputs(room.state, room.held));
        gp.afterTick();
      }
      expect(gp.info.phase).toBe('results');
      const race = gp.info.race;
      expect(race.map((s) => s.status)).toEqual(Array(10).fill('finished'));
      expect(race.every((s) => s.stops >= 1 && s.penalty === 0)).toBe(true);
    },
  );
});
