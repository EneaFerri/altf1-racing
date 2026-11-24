/**
 * Exports the game's circuit data to JSON for the macOS app (`04_macos/`, 01_docs/macos.md): per
 * circuit of `GP_TRACKS` its `TrackDefinition`, its OSM scenery (`<id>Layout.ts`) and, on an
 * elevated circuit, its land grid (`<id>Land.ts`). The Swift app reads these files and never the
 * TypeScript, so the circuits stay generated in one place (01_tools/openf1).
 *
 * Read only: it imports the web code and writes `04_macos/AltF1Core/Sources/AltF1Core/Resources/Circuits/`.
 * Run from the repo root: `node --import ./01_tools/resolveTs.ts 01_tools/swiftExport/export.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHARED = join(ROOT, '01_packages/shared/src/index.ts');
const THEMES = join(ROOT, '01_packages/client/src/view/themes');
const OUT = join(ROOT, '04_macos/AltF1Core/Sources/AltF1Core/Resources/Circuits');

// The scenery files import `@altf1/shared`: resolved to its source, with no `npm install` needed.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@altf1/shared') return nextResolve(pathToFileURL(SHARED).href, context);
    return nextResolve(specifier, context);
  },
});

/** The circuits' ids (their file names), in `GP_TRACKS` order, and each one's export prefix. */
const CIRCUITS = [
  'monza',
  'barcelona',
  'monaco',
  'mexico',
  'singapore',
  'lasVegas',
  'saoPaulo',
] as const;

/** `lasVegas` → `LAS_VEGAS`: how the generated files name their exports. */
const prefixOf = (id: string): string => id.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase();

/** `PIT_BUILDINGS` → `pitBuildings`. */
const camel = (name: string): string =>
  name.toLowerCase().replace(/_([a-z])/g, (_match, c: string) => c.toUpperCase());

/** A module's exports named `<PREFIX>_<KEY>`, keyed by `key` in camelCase. */
function stripPrefix(module: Record<string, unknown>, prefix: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(module)) {
    if (name.startsWith(`${prefix}_`)) out[camel(name.slice(prefix.length + 1))] = value;
  }
  return out;
}

async function load(path: string): Promise<Record<string, unknown> | null> {
  try {
    return (await import(pathToFileURL(path).href)) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  }
}

const shared = (await import(pathToFileURL(SHARED).href)) as {
  GP_TRACKS: readonly { name: string }[];
  buildTrack: (definition: unknown) => { length: number };
} & Record<string, unknown>;

mkdirSync(OUT, { recursive: true });
const index: { id: string; name: string; elevated: boolean; length: number }[] = [];
for (const [order, id] of CIRCUITS.entries()) {
  const prefix = prefixOf(id);
  const definition = shared[prefix] as { name: string } | undefined;
  if (!definition || shared.GP_TRACKS[order] !== definition) {
    throw new Error(`${id}: not at position ${order} of GP_TRACKS — update CIRCUITS here`);
  }
  const scenery = await load(join(THEMES, `${id}Layout.ts`));
  const land = await load(join(THEMES, `${id}Land.ts`));
  const circuit = {
    id,
    definition,
    scenery: scenery ? stripPrefix(scenery, prefix) : {},
    land: land ? land[`${prefix}_LAND`] : null,
  };
  writeFileSync(join(OUT, `${id}.json`), JSON.stringify(circuit));
  // The lap's length (m), for the menus: what `buildTrack` makes of the definition.
  const length = Math.round(shared.buildTrack(definition).length * 10) / 10;
  index.push({ id, name: definition.name, elevated: circuit.land !== null, length });
}
if (shared.GP_TRACKS.length !== CIRCUITS.length) {
  throw new Error('GP_TRACKS has circuits this tool does not export — update CIRCUITS here');
}
writeFileSync(join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(`Exported ${index.length} circuits to ${OUT}`);
