/**
 * Build client.js from src/parts/*.js plus optional seed data.
 *
 * Default behaviour: build with an EMPTY seed — no projects, no tasks, no
 * scores, no habits. The shipped client.js in this repository is produced that
 * way, so a fresh install starts from a blank board.
 *
 * To build with your own data, put files in ./seed/ (all optional):
 *   seed/tasks.json   { projects: [{id,name,color,inbox}], tasks: [{id,projectId,
 *                       title,content,priority,status,deleted,date,allDay,remindAt,
 *                       tags,createdAt,completedAt,repeat,parentId}] }
 *   seed/habits.json  { habits: [{id,name,color,period,archived,currentStreak,
 *                       longestStreak,checkInCount,reminder,frequency:{type,
 *                       interval,byDay},targetStartDate}], checkIns: [{habitId,date}] }
 *   seed/scores.json  { items: [{id,score}] }
 *
 * The seed is stored as positional arrays instead of objects to keep the inline
 * module small; a 1.7k-task snapshot would otherwise cost a noticeable parse at
 * page boot.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/* CLI: --seed <dir> (default ./seed) and --out <file> (default ./client.js).
   The test suite builds a throwaway bundle from test/fixtures/demo so the shipped
   client.js can stay blank. */
const argv = process.argv.slice(2);
function argOf(flag, fallback) {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const seedDir = resolve(here, argOf('--seed', 'seed'));
const outPath = resolve(here, argOf('--out', 'client.js'));
const seedOutputPath = outPath.replace(/client\.js$/, 'seed.json');
mkdirSync(dirname(outPath), { recursive: true });

function readOptional(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

/* ------------------------------ tasks + projects ------------------------------ */
const snapshot = readOptional(join(seedDir, 'tasks.json'));
/* A fresh install gets one empty inbox so the board is usable before the first
   task exists; every other list, task, habit and score is user data and stays
   out of the shipped bundle. */
const DEFAULT_PROJECTS = [['inbox', '收集箱', '', 1]];
const projects = snapshot && snapshot.projects
  ? snapshot.projects.map((p) => [
      p.id,
      p.name,
      p.color || '',
      p.inbox ? 1 : 0
    ])
  : DEFAULT_PROJECTS.map((row) => row.slice());

let skipped = 0;
const tasks = [];
for (const t of (snapshot && snapshot.tasks) || []) {
  if (!t.title && !t.content) {
    skipped += 1;
    continue;
  }
  tasks.push([
    t.id,
    t.projectId,
    t.title,
    t.content || '',
    t.priority | 0,
    t.status | 0,
    t.deleted ? 1 : 0,
    t.date || '',
    t.allDay ? 1 : 0,
    t.remindAt || '',
    (t.tags || []).length ? t.tags : 0,
    t.createdAt || '',
    t.completedAt || '',
    t.repeat || '',
    t.parentId || ''
  ]);
}

/* Offline score library (docs/scoring-rubric.md): only id → score is inlined.
   The other fields (source / origin / updatedAt / rubricVersion / reason) are
   filled in at runtime by importSeedScores, which keeps the bundle small and
   guarantees that anything absent from the seed is reconstructed, never half-written. */
const SCORE_RUBRIC_VERSION = 'calibrated-2026-11';
const scoreSnapshot = readOptional(join(seedDir, 'scores.json'));
const scores = {};
for (const item of (scoreSnapshot && scoreSnapshot.items) || []) {
  if (!item || !item.id || typeof item.score !== 'number') continue;
  scores[item.id] = Math.round(item.score * 10) / 10;
}

const seed = { p: projects, t: tasks, scores: scores, scoreRubric: SCORE_RUBRIC_VERSION };
const seedJson = JSON.stringify(seed);
writeFileSync(seedOutputPath, seedJson, 'utf8');

/* Orphan projectId guard (read-only, never blocks the build).
   A task whose projectId is not in projects[*].id is an orphan; empty string or
   null counts as "no list" and is reported separately so the two numbers stay
   comparable with scripts/audit-orphan-projects.mjs.
   即使 0 条也打印摘要（0 条 = 跑过且干净，不是没跑），不给这条日志加 0 判断。 */
const seedProjectIds = new Set(projects.map((row) => row[0]));
let orphanRows = 0;
let emptyProjectRows = 0;
const orphanIdSet = new Set();
for (const row of tasks) {
  const projectId = row[1];
  if (!projectId) {
    emptyProjectRows += 1;
    continue;
  }
  if (seedProjectIds.has(projectId)) continue;
  orphanRows += 1;
  orphanIdSet.add(projectId);
}
const orphanIds = [...orphanIdSet].sort();
console.log(
  '[seed] orphan projectId: ' + orphanRows + ' 条 / ' + orphanIds.length + ' 个 id' +
  (orphanIds.length ? '（前 3 个：' + orphanIds.slice(0, 3).join(',') + '）' : '')
);
if (emptyProjectRows) {
  console.log('[seed] empty projectId: ' + emptyProjectRows + ' 条（视为无清单，不计入孤儿）');
}

/* Habits: independent check-in entities, not task rows.
   Row shape (must stay aligned with inflateHabits in 00-prelude.js):
   [id, name, color, period, archived, currentStreak, longestStreak, checkInCount,
    reminder, freqType, freqInterval, byDay[], targetStartDate, checksCSV] */
const habitSnapshot = readOptional(join(seedDir, 'habits.json'));
let habitRows = [];
if (habitSnapshot) {
  const checkByHabit = new Map();
  for (const checkIn of habitSnapshot.checkIns || []) {
    if (!checkIn || !checkIn.habitId || !checkIn.date) continue;
    if (!checkByHabit.has(checkIn.habitId)) checkByHabit.set(checkIn.habitId, []);
    checkByHabit.get(checkIn.habitId).push(String(checkIn.date).slice(0, 10));
  }
  habitRows = (habitSnapshot.habits || []).map((habit) => {
    const dates = (checkByHabit.get(habit.id) || []).sort();
    const freq = habit.frequency || {};
    return [
      habit.id,
      habit.name || '习惯',
      habit.color || '',
      habit.period === 'afternoon' || habit.period === 'evening' ? habit.period : 'morning',
      habit.archived ? 1 : 0,
      habit.currentStreak | 0,
      habit.longestStreak | 0,
      typeof habit.checkInCount === 'number' ? habit.checkInCount : dates.length,
      habit.reminder || '',
      freq.type || 'daily',
      freq.interval | 0 || 1,
      Array.isArray(freq.byDay) ? freq.byDay : [],
      habit.targetStartDate || '',
      dates.join(',')
    ];
  });
}
const habitJson = JSON.stringify({ h: habitRows });

const partsDir = join(here, 'src', 'parts');
const parts = readdirSync(partsDir)
  .filter((name) => name.endsWith('.js'))
  .sort();

const marker = '/*__SEED__*/ null';
const habitMarker = '/*__HABITS__*/ null';
let body = '';
for (const part of parts) {
  body += readFileSync(join(partsDir, part), 'utf8');
  body += '\n';
}

if (!body.includes(marker)) {
  throw new Error('seed marker missing from the prelude');
}
if (!body.includes(habitMarker)) {
  throw new Error('habit marker missing from the prelude');
}

const output = body.replace(marker, seedJson).replace(habitMarker, habitJson);
/* Atomic write: the plugin slot is a symlink and the client bundle hot-reloads,
   so a non-atomic write can be read half-finished inside the reload window. */
mkdirSync(dirname(outPath), { recursive: true });
const tmpPath = outPath + '.tmp';
writeFileSync(tmpPath, output, 'utf8');
renameSync(tmpPath, outPath);

const stat = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(
  [
    'projects=' + projects.length,
    'tasks=' + tasks.length,
    'skipped(empty)=' + skipped,
    'habits=' + habitRows.length,
    'scores=' + Object.keys(scores).length,
    'seed=' + stat(seedJson.length),
    'habitsSeed=' + stat(habitJson.length),
    'client.js=' + stat(output.length)
  ].join(' ')
);
