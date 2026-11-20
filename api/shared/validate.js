/* Validates a plan bundle (an imported routine file, a routine from the library, a starter plan)
 * before it can reach someone's training plan: every exercise resolves against the real
 * library, numbers stay in bounds, ids are safe. Errors are collected rather than thrown one
 * at a time, so a bad file reports everything wrong with it at once.
 */
import { libraryHas, libraryName, equipmentAllows, isDumbbellLift, machineAllows } from './library.js';

// A catalogue exercise the person's equipment does not reach, and that was not in the library
// slice they were offered (which already pins what they train). The prompt says "their
// equipment"; a model that names a leverage machine anyway is told so on the repair round
// instead of the plan arriving with a machine they do not own.
// Someone who owns no dumbbells (ctx.noDumbbells) is held to it even with no equipment stated, and
// so is a gym that lists its machines (ctx.machines, library.js gymMachines).
const offEquipment = (ctx, id) => libraryHas(id) && !(ctx.offered && ctx.offered.has(id))
  && ((!!ctx.equipment?.length && !equipmentAllows(ctx.equipment, id)) || (ctx.noDumbbells === true && isDumbbellLift(id))
    || !machineAllows(ctx.machines, id));
const OFF_EQUIPMENT = (where, id) => `${where} "${id}" needs equipment the user does not have — use an exercise from the library provided in the payload`;
import { glyphStr } from './glyphs.js';

const POLICIES = ['off', 'linear', 'greyskull', 'double', 'steady', 'triple', 'undulating', 'density', 'ladder', 'time'];
const MODES = ['reps', 'time', 'cardio'];
const MAX_INC = 50;
// A prescription, not a world record. Anything past this is a model slip or a hostile answer,
// and either way it reaches the plan, the progression engine and a printed line reading "∞ kg".
const MAX_WEIGHT = 1000;
const MAX_SPEED = 60;
// Ids that are object keys downstream (exIdMap/ridMap in plan-share.js). Assigning to them is
// silently ignored and reading them back yields Object.prototype, which persists into state as
// {} — a scheduled day that is forever rest, or an exercise that is forever "Unknown".
const RESERVED_IDS = ['__proto__', 'constructor', 'prototype'];
const safeId = v => isStr(v) && !RESERVED_IDS.includes(v);
const MAX_ROUTINES = 7;
const MAX_EX_PER_ROUTINE = 20;

const isStr = v => typeof v === 'string' && v.trim().length > 0;
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const clampStr = (v, n) => String(v == null ? '' : v).slice(0, n);
// Prose over the limit (a why, a summary, a note): cut at the last sentence (failing that, word) boundary and mark the cut with
// an ellipsis, so the lifter never reads a coach's text that stops mid-word.
const clampText = (v, n) => {
  const s = String(v == null ? '' : v);
  if (s.length <= n) return s;
  const head = s.slice(0, n - 1);
  const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '), head.lastIndexOf('\n'));
  if (sentence > n * 0.6) return head.slice(0, sentence + 1).trimEnd();
  const space = head.lastIndexOf(' ');
  return (space > n * 0.6 ? head.slice(0, space) : head).trimEnd() + '…';
};
// Ids and names keep the plain cut: an id must never grow an ellipsis.

/* Catalogue ids are zero-padded strings ("0024"), and a model that met an id as "0024" in the
 * payload routinely re-serializes it as a JSON number (24) or an unpadded string ("24") — to a
 * language model the quotes and the zeros carry no meaning. Both forms used to fail the
 * exact-match checks below, and the single repair round was spent re-sending the same number
 * (temperature 0), so the job failed whatever the model. The numeric forms are read as the
 * padded id they mean; anything else is judged exactly as it arrived. */
const asLibraryId = v => {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) v = String(v);
  return typeof v === 'string' && /^\d{1,5}$/.test(v) ? v.padStart(4, '0') : v;
};
// Routine icons: an icon key the app knows or a legacy emoji, never free text (#311).
export { ROUTINE_GLYPHS } from './glyphs.js';

const ODD_PER_SIDE = where =>
  `${where} is a per-side exercise, so reps are the total across both sides and must be an even number`;
// The longest plan note the Coach may write on an exercise: a cue or two, not an essay.
export const NOTE_TIP_MAX = 300;
export const MAX_COACH_BACKUPS = 3;
function backupsOf(list, selfId, ctx) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    if (!isStr(raw) && !(typeof raw === 'number' && Number.isInteger(raw))) continue;
    const id = libraryHas(raw) ? raw : asLibraryId(raw);
    if (!libraryHas(id) || id === selfId || out.includes(id) || offEquipment(ctx, id)) continue;
    out.push(id);
    if (out.length >= MAX_COACH_BACKUPS) break;
  }
  return out;
}

const INVERTED_RANGE = where =>
  `${where} sets a rep ceiling below its own floor — repsMax must be at least repsMin`;

/* =============================== created plans =============================== */

/**
 * Validate a creation bundle into something `mergePlan` can consume unchanged.
 * Returns { ok, bundle } or { ok:false, errors }.
 */
export function validatePlan(data, ctx = {}) {
  const errors = [];
  if (!data || typeof data !== 'object') return fail(['the answer was not an object']);
  if (data.nochange) return fail(['a plan was requested but the answer said "no change"']);
  if (!Array.isArray(data.routines) || !data.routines.length) {
    // A review-style change list where a plan was asked for (#471): say what the task wants,
    // so the repair round sends the plan rather than the same list again.
    errors.push(Array.isArray(data.changes)
      ? 'this task needs the complete plan (week and every routine with its ex), not a list of changes — start from refine.previous when revising, apply what was asked, and send the whole plan'
      : 'routines must be a non-empty array');
  }

  // A custom id that shadows a library id is the one case where the screen and the plan
  // disagree: the approval card resolves the id against the catalogue and shows that exercise,
  // while mergePlan remaps it to the model's invention. Whatever was approved is not applied.
  (Array.isArray(data.customEx) ? data.customEx : []).forEach((c, i) => {
    if (c && isStr(c.id) && libraryHas(c.id)) errors.push(`customEx[${i}].id "${c.id}" is already a library exercise id — give your own exercises their own ids`);
  });
  const customEx = (Array.isArray(data.customEx) ? data.customEx : [])
    .filter(c => c && safeId(c.id) && !libraryHas(c.id) && isStr(c.n))
    .slice(0, 20)
    .map(c => ({ id: clampStr(c.id, 40), n: clampStr(c.n, 60), bp: clampStr(c.bp || 'waist', 30), ...(c.desc ? { desc: clampText(c.desc, 1000) } : {}) }));
  // Ids the plan may name: invented in this same answer, or already the user's own.
  const proposedIds = new Set([...customEx.map(c => c.id), ...(ctx.customIds || [])]);

  const routines = [];
  (Array.isArray(data.routines) ? data.routines : []).slice(0, MAX_ROUTINES).forEach((r, ri) => {
    if (!r || typeof r !== 'object') { errors.push(`routines[${ri}] is not an object`); return; }
    if (!isStr(r.name)) errors.push(`routines[${ri}].name is required`);
    if (r.prog != null && !POLICIES.includes(r.prog)) errors.push(`routines[${ri}].prog "${r.prog}" is not one of ${POLICIES.join(', ')}`);
    const ex = [];
    (Array.isArray(r.ex) ? r.ex : []).slice(0, MAX_EX_PER_ROUTINE).forEach((e, ei) => {
      const where = `routines[${ri}].ex[${ei}]`;
      if (!e || (!isStr(e.id) && !(typeof e.id === 'number' && Number.isInteger(e.id)))) { errors.push(`${where}.id is required`); return; }
      // The padded reading (asLibraryId) is only the fallback: an id that resolves as sent —
      // a customEx entry defined in this same answer — keeps its identity.
      const eid = libraryHas(e.id) || proposedIds.has(e.id) ? e.id : asLibraryId(e.id);
      // FR-16: an id that resolves to nothing invalidates the proposal rather than being
      // dropped into a plan that renders blank the first time it is trained.
      if (!libraryHas(eid) && !proposedIds.has(eid)) {
        errors.push(`${where}.id ${JSON.stringify(e.id)} is not in the exercise library and is not one of your own customEx entries — use an id from the library provided in the payload`);
        return;
      }
      if (offEquipment(ctx, eid)) { errors.push(OFF_EQUIPMENT(`${where}.id`, eid)); return; }
      const clean = { id: eid, sets: isInt(e.sets, 1, 10) ? e.sets : 3 };
      const mode = MODES.includes(e.mode) ? e.mode : 'reps';
      const perSide = !!e.side;
      if (mode === 'cardio') {
        // Written out like 'time' below: without it every reader falls back to the catalogue,
        // and a cardio finisher on a non-cardio exercise (kettlebell swings) comes out as reps
        // with no target at all (#640).
        clean.mode = 'cardio';
        clean.min = isInt(e.min, 1, 180) ? e.min : 20;
        clean.speed = isNum(e.speed) && e.speed > 0 && e.speed <= MAX_SPEED ? e.speed : 8;
      } else if (mode === 'time') {
        clean.mode = 'time';
        clean.sec = isInt(e.sec, 5, 3600) ? e.sec : 45;
        if (isNum(e.weight) && e.weight > 0 && e.weight <= MAX_WEIGHT) clean.weight = e.weight;
      } else {
        clean.mode = 'reps';
        clean.reps = isInt(e.reps, 1, 100) ? e.reps : 10;
        if (perSide && clean.reps % 2) { errors.push(ODD_PER_SIDE(`${where}.reps`)); return; }
        if (isNum(e.weight) && e.weight > 0 && e.weight <= MAX_WEIGHT) clean.weight = e.weight;
      }
      if (e.prog != null) {
        if (!POLICIES.includes(e.prog)) errors.push(`${where}.prog "${e.prog}" is not one of ${POLICIES.join(', ')}`);
        else clean.prog = e.prog;
      }
      if (isNum(e.inc) && e.inc > 0 && e.inc <= MAX_INC) clean.inc = e.inc;
      if (isInt(e.repsMin, 1, 100)) clean.repsMin = e.repsMin;
      // The ceiling that makes bodyweight progression terminate (upstream #33): reaching it
      // adds a set and restarts the reps. Without it the Coach can neither see nor prescribe
      // how a push-up is meant to get harder.
      if (isInt(e.repsMax, 1, 100)) clean.repsMax = e.repsMax;
      // Triple progression's set ceiling (frontend/src/lib/progression.js tripleSetsOf).
      if (isInt(e.setsMax, 1, 10)) clean.setsMax = e.setsMax;
      if (clean.repsMax != null && clean.repsMin != null && clean.repsMax < clean.repsMin) {
        errors.push(INVERTED_RANGE(where)); return;
      }
      // Written out only when the plan disagrees with the catalogue, matching plan-share.js —
      // an absent flag means "whatever the exercise says", which is what every plan written
      // before these existed relies on.
      if (e.bodyweight != null) clean.bodyweight = !!e.bodyweight;
      if (perSide) clean.side = true;
      if (isStr(e.sg)) clean.sg = clampStr(e.sg, 20);
      if (isStr(e.why)) clean.why = clampText(e.why, 1500);
      // What to keep in mind while doing it ("brace before you unrack"), kept on the routine as
      // the exercise's plan note, which the workout shows under its name (#1003).
      if (isStr(e.note)) clean.note = clampText(e.note, NOTE_TIP_MAX);
      // Backups for a taken machine (#1003): library exercises only (a routine's backups are the
      // catalogue's, plan-share.js), never the exercise itself, never off the gym's equipment.
      // Optional extras, so one that does not resolve is left out rather than failing the plan.
      const subs = backupsOf(e.subs, eid, ctx);
      if (subs.length) clean.subs = subs;
      // The same exercise twice in one routine has no honest reading: `reorder` can never be
      // satisfied again (it demands each id once), and every targeted change resolves to
      // whichever copy comes first.
      if (ex.some(x => x.id === clean.id)) {
        errors.push(`${where}.id "${e.id}" appears twice in "${r.name || ri}" — list each exercise once`);
        return;
      }
      ex.push(clean);
    });
    if (!ex.length) errors.push(`routines[${ri}] has no valid exercises`);
    // Two routines answering to one id make the week ambiguous: `known` is a Set, so the day
    // validates while pointing at either of them.
    const rid = safeId(r.id) ? clampStr(r.id, 40) : 'r' + ri;
    if (routines.some(x => x.id === rid)) {
      errors.push(`routines[${ri}].id "${rid}" is already used by another routine in this plan`);
      return;
    }
    routines.push({
      id: rid,
      name: clampStr(r.name || 'Routine', 40),
      emoji: glyphStr(r.emoji),
      ...(POLICIES.includes(r.prog) ? { prog: r.prog } : {}),
      ...(isStr(r.why) ? { why: clampText(r.why, 1500) } : {}),
      ex
    });
  });

  // The week may only point at routines this bundle actually defines.
  const known = new Set(routines.map(r => r.id));
  const week = {};
  Object.entries(data.week || {}).forEach(([d, rid]) => {
    const day = +d;
    if (!isInt(day, 0, 6)) { errors.push(`week key "${d}" is not a weekday number 0-6`); return; }
    // The create schema asks for all seven weekdays, because a schema cannot say "exactly
    // daysPerWeek of these keys" — the model marks the rest with "rest" (or leaves it empty).
    // That is not a routine id and not a scheduled day: skip it before the lookup, so a plan with
    // three training days is still three days here.
    if (rid === 'rest' || rid === '') return;
    if (!known.has(rid)) { errors.push(`week[${d}] points at "${rid}", which is not one of the routines in this plan`); return; }
    week[day] = rid;
  });

  // FR-20: never start someone above what they have actually lifted.
  const caps = new Map((ctx.workingWeights || []).map(w => [w.id, w.best]));
  routines.forEach(r => r.ex.forEach(e => {
    if (e.weight == null) return;
    const cap = caps.get(e.id);
    // No cap for THIS exercise means they have never lifted it, whether or not they have
    // lifted anything else. Either way the number is invented, and create.md already tells the
    // model to omit it: drop it and let the first session set the baseline, like the app does.
    if (cap == null) delete e.weight;
    else if (e.weight > cap) e.weight = cap;
  }));

  // FR-17: honour the number of training days the user asked for.
  const want = ctx.daysPerWeek;
  // An absent week used to slip through: the plan then schedules nothing at all, which is not
  // the number of days anyone asked for either.
  if (isInt(want, 1, 7) && Object.keys(week).length !== want) {
    errors.push(`the week schedules ${Object.keys(week).length} days but ${want} were asked for`);
  }

  if (errors.length) return fail(errors);
  return {
    ok: true,
    bundle: {
      opengym_plan: 1,
      name: clampStr(data.name || 'Coach plan', 40),
      summary: clampText(data.summary || '', 4000),
      basedOn: clampText(data.basedOn || '', 1500),
      week, routines, customEx
    }
  };
}

function fail(errors) { return { ok: false, errors }; }
