import data from '../program.json';

const SUPPORTED_MAJOR = '1';

export class ProgramError extends Error {}

function fail(message) {
  throw new ProgramError(message);
}

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

  return p;
}

export const program = data;

export const getWorkout = (id) => program.workouts.find((w) => w.id === id) ?? null;

export const getExercise = (code) =>
  program.workouts.flatMap((w) => w.exercises).find((ex) => ex.code === code) ?? null;

export const getWorkoutForExercise = (code) =>
  program.workouts.find((w) => w.exercises.some((ex) => ex.code === code)) ?? null;

export const metaLine = (ex) => ex.tempo ?? ex.benefit ?? ex.grip ?? null;

export function todayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
