import type { CarDamage } from '@altf1/shared';
import { damageLevel } from './format';

/** The parts drawn, in the order of their cells in the outline (see hud.css). */
const PARTS = ['frontWing', 'tyreFL', 'tyreFR', 'tyreRL', 'tyreRR', 'rearWing'] as const;
type Part = (typeof PARTS)[number];

/**
 * Damage panel (Grand Prix), bottom right: the car seen from above, front wing, four tyres and
 * rear wing each coloured by its damage (white → yellow → orange → red). Shown only while the car
 * has damage, i.e. in a race with damage. Reads state only.
 */
export class DamagePanel {
  private readonly root = element('div', 'hud-damage');
  private readonly cells: Record<Part, HTMLElement>;
  private shown: CarDamage | undefined;

  constructor() {
    const car = element('div', 'hud-damage-car');
    this.cells = Object.fromEntries(
      PARTS.map((part) => [part, element('i', `hud-damage-part hud-damage-${part}`)]),
    ) as Record<Part, HTMLElement>;
    car.append(...PARTS.map((part) => this.cells[part]), element('i', 'hud-damage-body'));
    const title = element('span', 'hud-label');
    title.textContent = 'DAMAGE';
    this.root.append(title, car);
    this.root.hidden = true;
    document.body.appendChild(this.root);
  }

  /** Hides it whatever the damage (the own car off the track). */
  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  /** Call every frame with the own car's damage; undefined (no damage in this race) hides it. */
  update(damage: CarDamage | undefined): void {
    if (damage === this.shown) return;
    this.shown = damage;
    this.root.hidden = damage === undefined;
    if (!damage) return;
    const [fl, fr, rl, rr] = damage.tyres;
    const values: Record<Part, number> = {
      frontWing: damage.frontWing,
      tyreFL: fl,
      tyreFR: fr,
      tyreRL: rl,
      tyreRR: rr,
      rearWing: damage.rearWing,
    };
    for (const part of PARTS) {
      const cell = this.cells[part];
      cell.dataset['level'] = damageLevel(values[part]);
      cell.title = `${Math.round(values[part] * 100)}%`;
    }
  }
}

function element(tag: 'div' | 'i' | 'span', className: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}
