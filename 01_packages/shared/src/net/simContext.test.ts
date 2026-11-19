import { describe, expect, it } from 'vitest';
import { WET_PARAMS } from '../config/weather';
import { placePuddles } from '../sim/weather';
import { buildTrack } from '../track/buildTrack';
import { SAO_PAULO } from '../track/layouts/saoPaulo';
import { onlineSimContext } from './simContext';

const track = buildTrack(SAO_PAULO, { pitLane: true });

describe('onlineSimContext', () => {
  it('is dry unless the rain is asked for', () => {
    expect(onlineSimContext(track).weather).toBeUndefined();
    expect(onlineSimContext(track, { weather: 'dry' }).weather).toBeUndefined();
  });

  it('makes the track wet in the rain, with the puddles every machine places', () => {
    expect(onlineSimContext(track, { weather: 'rain', damage: true }).weather).toEqual({
      params: WET_PARAMS,
      puddles: placePuddles(track),
    });
  });
});
