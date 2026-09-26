import data from '../program.json';

const SUPPORTED_MAJOR = '1';

export class ProgramError extends Error {}

function fail(message) {
  throw new ProgramError(message);
}

// The swim is logged like an exercise, one free-text entry per day, under a
// code no exercise may take: "SWIM:<YYYY-MM-DD>".
export const SWIM_LOG = 'SWIM';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const byCodeHas = (p, code) => p.workouts.some((w) => w.exercises.some((ex) => ex.code === code));

const sum = (blocks) => blocks.reduce((total, block) => total + block.meters, 0);

// Distances are the one thing a typo would silently get wrong, so every total
// is checked against the session length rather than trusted.
function validateSwim(swim) {
  const { poolMeters, sessionMeters, routines, schedule, express } = swim;
  if (!Number.isFinite(poolMeters) || !Number.isFinite(sessionMeters)) fail('swim needs poolMeters and sessionMeters.');

  const whole = (meters, where) => {
    if (!Number.isFinite(meters) || meters % poolMeters !== 0) {
      fail(`Swim ${where}: ${meters}m is not a whole number of ${poolMeters}m lengths.`);
    }
  };

  const ids = new Set();
  for (const routine of routines ?? []) {
    ids.add(routine.id);
    for (const block of routine.blocks) whole(block.meters, `${routine.id} / ${block.title}`);
    const total = sum(routine.blocks) * (routine.rounds ?? 1);
    if (total !== sessionMeters) fail(`Swim routine ${routine.id} adds up to ${total}m, not ${sessionMeters}m.`);
  }

  const days = new Set((schedule ?? []).map((row) => row.day));
  for (const day of WEEKDAYS) if (!days.has(day)) fail(`Swim schedule has no ${day}.`);
  for (const row of schedule) {
    if (!ids.has(row.routineId)) fail(`Swim schedule ${row.day} names unknown routine ${row.routineId}.`);
  }

  if (express) {
    for (const part of [express.warmUp, express.mainBlock, express.coolDown]) whole(part.meters, `express / ${part.title}`);
    for (const option of express.options) {
      const total = expressMeters(express, option.mainBlocks);
      if (total !== option.meters) fail(`Express option with ${option.mainBlocks} blocks is ${total}m, not ${option.meters}m.`);
    }
  }
}

export const expressMeters = (express, mainBlocks) =>
  express.warmUp.meters + mainBlocks * express.mainBlock.meters + express.coolDown.meters;

export function validateProgram(p = data) {
  if (typeof p?.schemaVersion !== 'string') fail('program.json has no schemaVersion.');

  const major = p.schemaVersion.split('.')[0];
  if (major !== SUPPORTED_MAJOR) {
    fail(
      `This app understands program schema ${SUPPORTED_MAJOR}.x but program.json declares ` +
        `${p.schemaVersion}. Update the app before loading this program.`
    );
  }

  if (!Array.isArray(p.workouts) || p.workouts.length === 0) fail('program.json has no workouts.');

  const seen = new Set();
  for (const workout of p.workouts) {
    if (!workout.id) fail('A workout is missing its id.');
    if (!Array.isArray(workout.exercises) || workout.exercises.length === 0) {
      fail(`Workout ${workout.id} has no exercises.`);
    }
    for (const ex of workout.exercises) {
      const where = `${workout.id} / ${ex.code ?? '(no code)'}`;
      if (!ex.code) fail(`An exercise in ${workout.id} is missing its code.`);
      if (seen.has(ex.code)) fail(`Duplicate exercise code ${ex.code}.`);
      seen.add(ex.code);
      if (!ex.name) fail(`Exercise ${where} is missing its name.`);
      if (!Number.isFinite(ex.sets)) fail(`Exercise ${where} has a non-numeric sets value.`);
      if (!Array.isArray(ex.repRange) || ex.repRange.length !== 2 || !ex.repRange.every(Number.isFinite)) {
        fail(`Exercise ${where} needs a repRange of two numbers.`);
      }
      if (!Array.isArray(ex.cues)) fail(`Exercise ${where} is missing its cues array.`);
    }
  }

  if (byCodeHas(p, SWIM_LOG)) fail(`${SWIM_LOG} is reserved for the swim log; no exercise may use it.`);
  if (p.swim) validateSwim(p.swim);

  // logAs must land on a real exercise that owns its log, so a lookup is
  // always one hop and can never loop.
  const byCode = new Map(p.workouts.flatMap((w) => w.exercises).map((ex) => [ex.code, ex]));
  for (const ex of byCode.values()) {
    if (ex.logAs === undefined) continue;
    const target = byCode.get(ex.logAs);
    if (!target || target === ex) fail(`Exercise ${ex.code} logs as ${ex.logAs}, which is not another exercise.`);
    if (target.logAs !== undefined) fail(`Exercise ${ex.code} logs as ${ex.logAs}, which itself logs elsewhere.`);
  }

  return p;
}

export const program = data;

export const getWorkout = (id) => program.workouts.find((w) => w.id === id) ?? null;

export const getExercise = (code) =>
  program.workouts.flatMap((w) => w.exercises).find((ex) => ex.code === code) ?? null;

export const getWorkoutForExercise = (code) =>
  program.workouts.find((w) => w.exercises.some((ex) => ex.code === code)) ?? null;

// The same movement on two days (A6/B6) keeps one log: B6 declares
// "logAs": "A6", and every read and write goes through the owning code.
export const logCodeFor = (code) => getExercise(code)?.logAs ?? code;

// Every other exercise writing into the same log as `code`.
export const sharedLogWith = (code) => {
  const owner = logCodeFor(code);
  return program.workouts
    .flatMap((w) => w.exercises)
    .filter((ex) => ex.code !== code && logCodeFor(ex.code) === owner);
};

export const getSwimRoutine = (id) => program.swim?.routines.find((r) => r.id === id) ?? null;

// Unlike the gym rotation, the swim is fixed to the weekday.
export function swimForDate(date = new Date()) {
  const day = WEEKDAYS[date.getDay()];
  const row = program.swim?.schedule.find((r) => r.day === day);
  return row ? { ...row, routine: getSwimRoutine(row.routineId) } : null;
}

// Minutes at the athlete's own session pace, rests included, to the nearest 5.
export const swimMinutes = (meters, swim = program.swim) =>
  Math.round((meters * swim.sessionMinutes) / swim.sessionMeters / 5) * 5;

export const metaLine = (ex) => ex.tempo ?? ex.benefit ?? ex.grip ?? null;

export function todayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
