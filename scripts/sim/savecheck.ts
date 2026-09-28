// Save/restore round-trip test: node --import ./scripts/sim/register.mjs scripts/sim/savecheck.ts
import { World } from '../../src/game/world';
import { simStep } from '../../src/game/sim';
import { EnemyAI } from '../../src/game/ai';

const boot = (w: World) => { const ai = new EnemyAI(w, 2); w.onUpdate.push(simStep, (ww, dt) => ai.update(ww, dt)); return w; };
const a = boot(new World({ seed: 99, style: 'goller', difficulty: 'normal', civ: 'franks' }));
while (a.time < 360) a.update(0.1);
const json = JSON.stringify(a.toSave());
const b = boot(new World({ seed: 0, style: 'goller', difficulty: 'normal', restore: JSON.parse(json) }));
const sig = (w: World) => ({ ents: w.entities.size, time: Math.round(w.time), res: Object.values(w.players[2].res).map(Math.floor).join(','), civ: w.players[1].civ + '/' + w.players[2].civ, techs: [...w.players[1].techs].join(','), explored: w.explored.reduce((s, v) => s + v, 0), pop: `${w.players[2].pop}/${w.players[2].popCap}` });
console.log('orig    ', JSON.stringify(sig(a)));
console.log('restored', JSON.stringify(sig(b)));
console.log('save size', (json.length / 1024).toFixed(1), 'KB');
while (b.time < 960) b.update(0.1);
console.log('after 10 more min', JSON.stringify(sig(b)), 'winner', b.winner);
