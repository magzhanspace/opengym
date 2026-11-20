/* Plan validation (shared/validate.js validatePlan), on its own: an imported or library plan
 * is checked against the real exercise library before it can reach anyone's training plan.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tempData } from './helpers.mjs';

tempData();
const { validatePlan } = await import('../shared/validate.js');

/* ---------------- created plans ---------------- */

test('a plan referencing an unknown exercise is rejected, not quietly trimmed', () => {
  const r = validatePlan({
    routines: [{ name: 'A', ex: [{ id: '0001', sets: 3, reps: 10 }, { id: 'not-a-real-id', sets: 3, reps: 10 }] }]
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('not-a-real-id')));
});

test('a plan may reference a custom exercise it defines in the same answer', () => {
  const r = validatePlan({
    routines: [{ name: 'A', ex: [{ id: 'cx1', sets: 3, reps: 10 }] }],
    customEx: [{ id: 'cx1', n: 'Sandbag carry', bp: 'back' }]
  });
  assert.equal(r.ok, true);
  assert.equal(r.bundle.customEx[0].n, 'Sandbag carry');
});

test('a flag is one pair of regional indicators, not a run of them spelling a word; legacy icon keys survive (#311)', () => {
  const glyph = emoji => validatePlan({ routines: [{ id: 'r1', name: 'A', emoji, ex: [{ id: '0001', sets: 3, reps: 10 }] }] }).bundle.routines[0].emoji;
  const ri = w => [...w].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
  assert.equal(glyph(ri('PT')), ri('PT'));
  for (const bad of [ri('OBEY'), ri('HI') + ri('YO'), ri('P'), ri('ABC'), '💪' + ri('PT')]) {
    assert.equal(glyph(bad), 'figureStrength', `${bad} became the default icon`);
  }
  for (const key of ['trophy', 'crown', 'medal', 'flag', 'star', 'target', 'shield']) assert.equal(glyph(key), key);
});

test('the week may only point at routines the plan actually defines', () => {
  const r = validatePlan({ routines: [{ id: 'r1', name: 'A', ex: [{ id: '0001', sets: 3, reps: 10 }] }], week: { 1: 'ghost' } });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('ghost')));
});

test('proposed baselines are capped at what the lifter has actually handled', () => {
  const r = validatePlan(
    { routines: [{ id: 'r1', name: 'A', ex: [{ id: '0001', sets: 3, reps: 10, weight: 100 }] }] },
    { workingWeights: [{ id: '0001', best: 40 }] }
  );
  assert.equal(r.ok, true);
  assert.equal(r.bundle.routines[0].ex[0].weight, 40, 'optimism is clamped to evidence');
});

test('a plan that ignores the requested number of training days is rejected', () => {
  const r = validatePlan(
    { routines: [{ id: 'r1', name: 'A', ex: [{ id: '0001', sets: 3, reps: 10 }] }], week: { 1: 'r1', 2: 'r1', 3: 'r1', 4: 'r1' } },
    { daysPerWeek: 3 }
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('4 days') && e.includes('3')));
});

test('an unknown progression policy is rejected', () => {
  const r = validatePlan({ routines: [{ name: 'A', prog: 'vibes', ex: [{ id: '0001', sets: 3, reps: 10 }] }] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('vibes')));
});

/* ---------------- the two v1.2.4 flags ---------------- */

test('a created plan carries the rep ceiling and the two flags through unchanged', () => {
  const r = validatePlan({
    routines: [{
      id: 'r1', name: 'A', ex: [
        { id: '0001', sets: 3, reps: 12, repsMin: 8, repsMax: 20, bodyweight: true },
        { id: '0043', sets: 3, reps: 16, side: true }
      ]
    }]
  });
  assert.equal(r.ok, true);
  const [bw, side] = r.bundle.routines[0].ex;
  assert.equal(bw.repsMax, 20, 'without the ceiling the Coach cannot say how a push-up progresses');
  assert.equal(bw.bodyweight, true);
  assert.equal(side.side, true);
  assert.equal(bw.side, undefined, 'a flag nobody set stays absent, so the catalogue still decides');
});

test('triple progression and its set ceiling survive a created plan', () => {
  const r = validatePlan({ routines: [{ id: 'r1', name: 'A', ex: [{ id: '0043', sets: 3, setsMax: 5, reps: 12, repsMin: 8, prog: 'triple' }] }] });
  assert.equal(r.ok, true);
  assert.equal(r.bundle.routines[0].ex[0].prog, 'triple');
  assert.equal(r.bundle.routines[0].ex[0].setsMax, 5);
  // A ceiling past what a plan holds is not one.
  const wild = validatePlan({ routines: [{ id: 'r1', name: 'A', ex: [{ id: '0043', sets: 3, setsMax: 40, reps: 12, prog: 'triple' }] }] });
  assert.equal(wild.bundle.routines[0].ex[0].setsMax, undefined);
});

test('unilateral reps are a total across both sides, so an odd one is refused', () => {
  const odd = validatePlan({ routines: [{ id: 'r1', name: 'A', ex: [{ id: '0043', sets: 3, reps: 15, side: true }] }] });
  assert.equal(odd.ok, false);
  assert.ok(odd.errors.some(e => e.includes('even')));
  // The same number is perfectly fine on an exercise that is not per-side.
  assert.equal(validatePlan({ routines: [{ id: 'r1', name: 'A', ex: [{ id: '0043', sets: 3, reps: 15 }] }] }).ok, true);
});

test('two routines cannot answer to the same id', () => {
  // `known` is a Set, so a week pointing at "r1" validated while it was ambiguous which of the
  // two it meant — and the client resolves it by whichever happened to be found first.
  const r = validatePlan({
    routines: [
      { id: 'r1', name: 'A', ex: [{ id: '0001', sets: 3, reps: 10 }] },
      { id: 'r1', name: 'B', ex: [{ id: '0002', sets: 3, reps: 10 }] }
    ],
    week: { 1: 'r1' }
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('already used')));
});

test('an auto-assigned routine id cannot collide with an explicit one', () => {
  const r = validatePlan({
    routines: [
      { name: 'A', ex: [{ id: '0001', sets: 3, reps: 10 }] },   // becomes "r0"
      { id: 'r0', name: 'B', ex: [{ id: '0002', sets: 3, reps: 10 }] }
    ]
  });
  assert.equal(r.ok, false);
});

test('one exercise cannot appear twice in the same routine', () => {
  // A duplicate makes every later reorder unsatisfiable — it must list each id exactly once —
  // and makes a targeted change resolve to whichever copy comes first.
  const r = validatePlan({
    routines: [{ name: 'A', ex: [{ id: '0001', sets: 3, reps: 10 }, { id: '0001', sets: 4, reps: 8 }] }]
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('twice')));
});

test('a plan with no week at all does not satisfy a requested day count', () => {
  // The day-count check used to be skipped entirely when the week was empty, so "four days a
  // week" was answered with a plan that schedules nothing.
  const r = validatePlan(
    { routines: [{ id: 'r1', name: 'A', ex: [{ id: '0001', sets: 3, reps: 10 }] }] },
    { daysPerWeek: 4 }
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('0 days')));
});

test('a starting weight is dropped when there is nothing logged to justify it', () => {
  // With no working weights the FR-20 cap has nothing to clamp against, so an invented number
  // used to pass straight through to a lifter the model has never seen.
  const r = validatePlan(
    { routines: [{ id: 'r1', name: 'A', ex: [{ id: '0001', sets: 3, reps: 10, weight: 100 }] }], week: { 1: 'r1' } },
    { daysPerWeek: 1 }
  );
  assert.equal(r.ok, true);
  assert.equal(r.bundle.routines[0].ex[0].weight, undefined);
});

test('a starting weight survives only where that exercise has actually been lifted', () => {
  // The cap is per exercise. Having trained *something* says nothing about a movement they
  // have never done, so a number there is still invented and still goes.
  const r = validatePlan(
    {
      routines: [{
        id: 'r1', name: 'A', ex: [
          { id: '0001', sets: 3, reps: 10, weight: 50 },    // trained: capped, kept
          { id: '0002', sets: 3, reps: 10, weight: 100 }    // never trained: dropped
        ]
      }],
      week: { 1: 'r1' }
    },
    { daysPerWeek: 1, workingWeights: [{ id: '0001', best: 60 }] }
  );
  assert.equal(r.ok, true);
  assert.equal(r.bundle.routines[0].ex[0].weight, 50);
  assert.equal(r.bundle.routines[0].ex[1].weight, undefined);
});

test('a starting weight above what they have handled is pulled back down to it', () => {
  const r = validatePlan(
    { routines: [{ id: 'r1', name: 'A', ex: [{ id: '0001', sets: 3, reps: 10, weight: 200 }] }], week: { 1: 'r1' } },
    { daysPerWeek: 1, workingWeights: [{ id: '0001', best: 60 }] }
  );
  assert.equal(r.bundle.routines[0].ex[0].weight, 60);
});

test('a custom exercise may not claim a library id', () => {
  // The approval card resolves the id against the catalogue and shows that exercise; mergePlan
  // remaps it to the model's invention. What was approved would not be what got applied.
  const r = validatePlan({
    routines: [{ name: 'A', ex: [{ id: '0001', sets: 3, reps: 10 }] }],
    customEx: [{ id: '0001', n: 'Bench Press', bp: 'chest' }]
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('already a library exercise id')));
});

test('ids that are prototype keys are refused', () => {
  // plan-share.js uses bare object literals for its id maps: writing __proto__ is ignored and
  // reading it back yields Object.prototype, which persists into synced state as {}.
  const r = validatePlan({
    routines: [{ id: '__proto__', name: 'A', ex: [{ id: '0001', sets: 3, reps: 10 }] }],
    week: { 1: '__proto__' }
  });
  assert.equal(r.ok, false);
});

test('names and ids keep the plain cut: only prose grows an ellipsis', () => {
  const plan = { coach_contract: 1, week: { 1: 'r1' }, routines: [{ id: 'r1', name: 'Push day with a very long name that never ends at all', ex: [{ id: '0025', sets: 3, reps: 8 }] }] };
  const r = validatePlan(plan, {});
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.bundle.routines[0].name, plan.routines[0].name.slice(0, 40));
  assert.ok(!r.bundle.routines[0].name.endsWith('…'));
});

test('a created plan written in Russian validates, custom exercises included', () => {
  const r = validatePlan({
    name: 'План на неделю',
    summary: 'Базовый план на три дня с акцентом на верх тела.',
    routines: [{ id: 'r1', name: 'Верх тела', ex: [{ id: 1, sets: 3, reps: 10 }, { id: 'cx1', sets: 3, reps: 12 }] }],
    customEx: [{ id: 'cx1', n: 'Перенос мешка с песком', bp: 'back' }],
    week: { 1: 'r1' }
  });
  assert.equal(r.ok, true, (r.errors || []).join(' | '));
  assert.equal(r.bundle.routines[0].ex[0].id, '0001');
  assert.equal(r.bundle.customEx[0].n, 'Перенос мешка с песком');
  assert.equal(r.bundle.routines[0].name, 'Верх тела');
});

/* ---------------- plan notes and backups (#1003) ---------------- */

test('a created plan keeps a short note and up to three library backups per exercise', () => {
  const r = validatePlan({
    routines: [{ name: 'A', ex: [{ id: '0009', sets: 3, reps: 10, note: 'Brace your core before each rep.', subs: ['1274', '0001', 'nope', '0009', '0007', '0043'] }] }]
  });
  assert.equal(r.ok, true);
  const ex = r.bundle.routines[0].ex[0];
  assert.equal(ex.note, 'Brace your core before each rep.');
  // The unknown id and the exercise itself are left out, the rest kept up to three.
  assert.deepEqual(ex.subs, ['1274', '0001', '0007']);
});

test('backups off the gym equipment are dropped, a missing note or list leaves no field', () => {
  const ctx = { equipment: ['dumbbell'], offered: new Set(['1274', '0001']) };
  const r = validatePlan({ routines: [{ name: 'A', ex: [{ id: '1274', sets: 3, reps: 10, subs: ['0009', '0001'] }, { id: '0001', sets: 3, reps: 10, subs: [] }] }] }, ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(r.bundle.routines[0].ex[0].subs, ['0001']);
  assert.equal('subs' in r.bundle.routines[0].ex[1], false);
  assert.equal('note' in r.bundle.routines[0].ex[1], false);
});

test('a plan note is held to a cue or two', () => {
  const r = validatePlan({ routines: [{ name: 'A', ex: [{ id: '0001', sets: 3, reps: 10, note: 'Keep it slow. '.repeat(60) }] }] });
  assert.equal(r.ok, true);
  assert.ok(r.bundle.routines[0].ex[0].note.length <= 301);
});
