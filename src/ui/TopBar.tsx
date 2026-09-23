import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SOURCES } from '../render/manifest';
import type { Res, Resources } from '../game/types';
import { C, F } from './theme';

interface Props {
  res: Resources;
  workers: Record<Res, number>;
  pop: number;
  cap: number;
  onMenu: () => void;
  onRes: (r: Res) => void;
}

const ICONS = ['icon_food', 'icon_wood', 'icon_gold', 'icon_stone'] as const;
const KEYS: Res[] = ['food', 'wood', 'gold', 'stone'];

export function fmtTime(t: number) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/** Single-row resource bar. The small number under each amount is how many villagers work that resource. */
export function TopBar({ res, workers, pop, cap, onMenu, onRes }: Props) {
  const popFull = pop >= cap;
  return (
    <View style={s.wrap}>
      {KEYS.map((k, i) => (
        <Pressable key={k} style={s.res} onPress={() => onRes(k)} hitSlop={4}>
          <Image source={SOURCES[ICONS[i]]} style={s.icon} />
          <View>
            <Text style={s.num} numberOfLines={1}>{Math.floor(res[k])}</Text>
            <Text style={s.workers}>👤{workers[k]}</Text>
          </View>
        </Pressable>
      ))}
      <View style={[s.res, s.pop, popFull && s.popFull]}>
        <Image source={SOURCES.icon_pop} style={s.icon} />
        <Text style={[s.num, popFull && { color: C.warn }]}>{pop}/{cap}</Text>
      </View>
      <Pressable onPress={onMenu} hitSlop={10} style={({ pressed }) => [s.menu, pressed && { opacity: 0.6 }]}>
        <Text style={s.menuTxt}>≡</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.wood, borderBottomWidth: 2, borderColor: C.goldDark, paddingHorizontal: 5, paddingVertical: 4 },
  res: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 6, paddingHorizontal: 3, paddingVertical: 2, minWidth: 0 },
  pop: { flex: 1.15 },
  popFull: { backgroundColor: 'rgba(180,60,20,0.4)' },
  icon: { width: 20, height: 20, marginRight: 2, resizeMode: 'contain' },
  num: { color: C.text, fontFamily: F.bodyB, fontSize: 13.5, lineHeight: 15, fontVariant: ['tabular-nums'] },
  workers: { color: C.textDim, fontFamily: F.body, fontSize: 9, lineHeight: 10 },
  menu: { width: 32, height: 30, borderRadius: 6, borderWidth: 1, borderColor: C.goldDark, alignItems: 'center', justifyContent: 'center', backgroundColor: C.wood2 },
  menuTxt: { color: C.goldLight, fontSize: 18, lineHeight: 20, fontWeight: '700' },
});
