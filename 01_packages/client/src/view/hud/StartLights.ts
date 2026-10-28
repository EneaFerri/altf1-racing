import { GRAND_PRIX } from '@altf1/shared';
import './hud.css';

/** The F1 start gantry, top centre under the timing strip: the red lights that are on, if any. */
export class StartLights {
  private readonly root = document.createElement('div');
  private readonly lamps: HTMLElement[];
  private shown = -1;

  constructor() {
    this.root.className = 'start-lights';
    this.lamps = Array.from({ length: GRAND_PRIX.lights.count }, () => {
      const lamp = document.createElement('i');
      lamp.className = 'start-lamp';
      return lamp;
    });
    this.root.append(...this.lamps);
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
  }

  /** `on` red lights lit (0 hides the gantry: before the start, and at lights out). */
  update(on: number): void {
    if (on === this.shown) return;
    this.shown = on;
    this.root.style.display = on > 0 ? '' : 'none';
    this.lamps.forEach((lamp, i) => lamp.classList.toggle('start-lamp-on', i < on));
  }
}
