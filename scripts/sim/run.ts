// Headless balance test: player 1 idles (only villagers gather), AI plays. Usage:
// node --import ./scripts/sim/register.mjs scripts/sim/run.ts [difficulty] [minutes] [seed]
import { World } from '../../src/game/world.ts';
import { simStep } from '../../src/game/sim.ts';
import { EnemyAI } from '../../src/game/ai.ts';
import type { Difficulty } from '../../src/game/types.ts';

const difficulty = (process.argv[2] ?? 'normal') as Difficulty;
const minutes = Number(process.argv[3] ?? 25);
const seed = Number(process.argv[4] ?? 12345);
const w = new World({ seed, style: 'goller', difficulty });
const ai = new EnemyAI(w, 2);
w.onUpdate.push(simStep, (ww, dt) => ai.update(ww, dt));
const snap = () => {
  const m: Record<string, number> = {};
  for (const e of w.ownEntities(2)) { const k = e.type + (e.kind === 'building' && !e.built ? '*' : ''); m[k] = (m[k] ?? 0) + 1; }
  const p = w.players[2];
  const idle = w.ownEntities(2).filter((e) => e.type === 'villager' && e.order?.kind === 'idle').length;
  const jobs: Record<string, number> = {};
  for (const e of w.ownEntities(2)) if (e.type === 'villager') { const o = e.order!; const k = o.kind === 'gather' ? 'g:' + (w.get(o.target)?.resType ?? '?') : o.kind; jobs[k] = (jobs[k] ?? 0) + 1; }
  return `t=${(w.time / 60).toFixed(1)}m age=${p.age} pop=${p.pop}/${p.popCap} idle=${idle} res=${JSON.stringify(Object.fromEntries(Object.entries(p.res).map(([k, v]) => [k, Math.floor(v)])))} jobs=${JSON.stringify(jobs)} ents=${JSON.stringify(m)}`;
};
const t0 = performance.now();
let lastMin = -1;
let feudalAt: number | undefined;
let castleAt: number | undefined;
let firstAttackAt: number | undefined;
let firstAttackSize = 0;
let humanTcLostAt: number | undefined;
let winnerAt: number | undefined;
while (w.time < minutes * 60 && !w.winner) {
  w.update(0.1); // 0.1s real = 0.15 game s
  const age = w.players[2].age;
  if (age >= 1 && feudalAt === undefined) feudalAt = w.time;
  if (age >= 2 && castleAt === undefined) castleAt = w.time;
  const attackers = w.ownEntities(2).filter((e) => e.kind === 'unit' && e.type !== 'villager' && e.type !== 'monk' && e.order?.kind === 'attack');
  if (attackers.length && firstAttackAt === undefined) { firstAttackAt = w.time; firstAttackSize = attackers.length; }
  if (humanTcLostAt === undefined && !w.ownEntities(1).some((e) => e.kind === 'building' && e.type === 'town_center')) humanTcLostAt = w.time;
  if (w.winner && winnerAt === undefined) winnerAt = w.time;
  const min = Math.floor(w.time / 60);
  if (min !== lastMin && min % 2 === 0) { lastMin = min; console.log(snap()); }
}
console.log(snap());
const p1 = w.ownEntities(1);
console.log(`human entities left: ${p1.length}, winner=${w.winner}, ai techs=${[...w.players[2].techs].join(',')}, human lost=${w.players[1].stats.lost}, ms=${Math.round(performance.now() - t0)}`);
const minute = (seconds: number | undefined) => seconds === undefined ? '-' : `${(seconds / 60).toFixed(2)}m`;
console.log(`milestones feudal=${minute(feudalAt)} castle=${minute(castleAt)} firstAttack=${minute(firstAttackAt)}(${firstAttackSize}) humanTC=${minute(humanTcLostAt)} winner=${w.winner}@${minute(winnerAt)}`);
