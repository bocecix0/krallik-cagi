// Validates start resources on many seeds. Usage: node --import ./scripts/sim/register.mjs scripts/sim/mapcheck.ts [count]
import { generateMap, type MapStyle } from '../../src/game/mapgen';

const count = Number(process.argv[2] ?? 40);
let bad = 0;
for (const style of ['goller', 'anadolu'] as MapStyle[]) {
  for (let seed = 1; seed <= count; seed++) {
    const m = generateMap(48, seed * 7919, style);
    m.starts.forEach((s, i) => {
      const cx = s.x + 2, cy = s.y + 2;
      const near = (type: string, r: number) => m.nodes.filter((n) => (type === 'tree' ? n.type.startsWith('tree') : n.type === type) && Math.hypot(n.x - cx, n.y - cy) <= r).length;
      const got = { berry: near('berry', 12), gold: near('gold', 16), stone: near('stone', 16), sheep: near('sheep', 12), tree: near('tree', 14) };
      const ok = got.berry >= 5 && got.gold >= 6 && got.stone >= 4 && got.sheep >= 3 && got.tree >= 20;
      if (!ok) { bad++; console.log(`${style} seed=${seed * 7919} p${i + 1}`, JSON.stringify(got)); }
    });
  }
}
console.log(bad ? `FAILED ${bad}` : 'all maps OK');
