/* The exercise catalogue the API checks plans against, in the five fields it needs.
 *
 * `library-data.js` is generated from the frontend dataset and committed (see
 * scripts/build-shared-assets.mjs) — the same arrangement the translated instruction packs use.
 * It is an ES module rather than JSON on purpose: bare node needs createRequire for JSON, Vite
 * needs an import attribute, and this file has to load under both without either knowing.
 */
import { EXERCISES } from './library-data.js';

export const LIBRARY = EXERCISES;
export const LIB_BY_ID = new Map(LIBRARY.map(e => [e.id, e]));

export const libraryHas = id => LIB_BY_ID.has(id);
export const libraryName = id => LIB_BY_ID.get(id)?.n || null;

/* Whether the person's equipment covers a catalogue exercise. Body weight is never gated, the
   same rule the app's own equipment profiles follow (frontend lib/equipment.js), and an id the
   catalogue does not hold (one of their own exercises) is theirs to judge, not ours. No
   equipment stated means the whole catalogue. */
const ALWAYS_AVAILABLE = 'body weight';
export function equipmentAllows(equipment, id) {
  const wanted = (equipment || []).map(x => String(x).toLowerCase());
  if (!wanted.length) return true;
  const eq = (LIB_BY_ID.get(id)?.eq || '').toLowerCase();
  return !eq || eq === ALWAYS_AVAILABLE || wanted.includes(eq);
}

/* The machines the gym has (#923, frontend lib/machine-kinds.js): an equipment profile may list
   the machine kinds it has ("leg press yes, leg extension no"). The active one's list, when the
   app filters by it, keeps a catalogue machine exercise of any other kind out; no list (or no
   filter) means the equipment alone decides, as before. A row without a kind is not a machine. */
export function gymMachines(S) {
  if (!S?.equipFilterOn || !Array.isArray(S.equipProfiles)) return null;
  const prof = S.equipProfiles.find(p => p && p.id === S.activeEquipId);
  const kinds = Array.isArray(prof?.machines) ? prof.machines.filter(k => typeof k === 'string' && k && k.length <= 40).slice(0, 64) : [];
  return kinds.length ? kinds : null;
}
export function machineAllows(machines, id) {
  if (!Array.isArray(machines) || !machines.length) return true;
  const mk = LIB_BY_ID.get(id)?.mk;
  return !mk || machines.includes(mk);
}

/* "I own no dumbbells", the app's switch under Settings → Equipment → Dumbbells (frontend
   lib/dumbbells.js ownsNoDumbbells): kept in the synced dumbbell map under `none`. */
export const ownsNoDumbbells = S => S?.dumbbells?.none?.on === true;
export const isDumbbellLift = id => (LIB_BY_ID.get(id)?.eq || '').toLowerCase() === 'dumbbell';

/* The bench (v1.4.5, Settings → Equipment → Bench, frontend lib/equipment.js benchKindOf and
   accessoriesOf, hand-copied here because the API cannot import the frontend): 'adjustable',
   'flat' or 'none'. A flat bench gets no incline or decline work, no bench gets no bench work.
   The profile that filters says it with its ticks; without one, S.bench does. */
const SELF_CONTAINED = new Set(['leverage machine', 'sled machine', 'assisted']);
const NO_TILT_BENCH = /push[- ]?ups?\b|pushups?\b|plank|pushdown|push press|jump|against (the |a )?wall|on (a )?box|chair|smith bar|suspender|stability ball|step[- ]?up|treadmill|walk|run\b|sprint|bike|cycl/;
export function benchNeedOf(id) {
  const e = LIB_BY_ID.get(id);
  if (!e || !e.n || SELF_CONTAINED.has(e.eq)) return null;
  const n = String(e.n).toLowerCase();
  if (/\bincline\b|\bdecline\b/.test(n) && !NO_TILT_BENCH.test(n)) return 'adjustable';
  return /\bbench\b/.test(n) ? 'flat' : null;
}
export function benchKind(S) {
  const prof = S?.equipFilterOn && Array.isArray(S.equipProfiles) ? S.equipProfiles.find(p => p && p.id === S.activeEquipId) : null;
  if (prof) {
    const have = Array.isArray(prof.equipment) ? prof.equipment : [];
    if ((prof.accV || 0) < 1) return 'adjustable';
    if (!have.includes('bench')) return 'none';
    return have.includes('adjustable bench') || (prof.accV || 0) < 3 ? 'adjustable' : 'flat';
  }
  return S?.bench === 'flat' || S?.bench === 'none' ? S.bench : 'adjustable';
}
export function benchAllows(kind, id) {
  if (kind !== 'flat' && kind !== 'none') return true;
  const need = benchNeedOf(id);
  return !need || (kind === 'flat' && need === 'flat');
}
