import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SOURCES } from '../render/manifest';
import type { Resources } from '../game/types';
import { AGE_NAMES } from '../game/data';
import { C, F } from './theme';

interface Props {
  res: Resources;
  pop: number;
  cap: number;
  age: number;
  time: number;
  onMenu: () => void;
}

const ICONS = ['icon_food', 'icon_wood', 'icon_gold', 'icon_stone'] as const;
const KEYS = ['food', 'wood', 'gold', 'stone'] as const;

export function fmtTime(t: number) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function TopBar({ res, pop, cap, age, time, onMenu }: Props) {
  const popFull = pop >= cap;
  return (
    <View style={s.wrap}>
      <View style={s.row}>
        {KEYS.map((k, i) => (
          <View key={k} style={s.res}>
            <Image source={SOURCES[ICONS[i]]} style={s.icon} />
            <Text style={s.num} numberOfLines={1}>{Math.floor(res[k])}</Text>
          </View>
        ))}
        <View style={[s.res, popFull && s.popFull]}>
          <Image source={SOURCES.icon_pop} style={s.icon} />
          <Text style={[s.num, popFull && { color: C.warn }]}>{pop}/{cap}</Text>
        </View>
      </View>
      <View style={s.row2}>
        <Image source={SOURCES[`icon_age${age + 1}`] ?? SOURCES.icon_age1} style={s.ageIcon} />
        <Text style={s.age}>{AGE_NAMES[age]}</Text>
        <Text style={s.time}>{fmtTime(time)}</Text>
        <Pressable onPress={onMenu} hitSlop={10} style={({ pressed }) => [s.menu, pressed && { opacity: 0.6 }]}>
          <Text style={s.menuTxt}>≡</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: C.wood, borderBottomWidth: 2, borderColor: C.goldDark, paddingHorizontal: 8, paddingTop: 4, paddingBottom: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  res: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2, minWidth: 62 },
  popFull: { backgroundColor: 'rgba(180,60,20,0.35)' },
  icon: { width: 22, height: 22, marginRight: 3, resizeMode: 'contain' },
  num: { color: C.text, fontFamily: F.bodyB, fontSize: 15, fontVariant: ['tabular-nums'] },
  row2: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  ageIcon: { width: 20, height: 20, resizeMode: 'contain', marginRight: 5 },
  age: { color: C.goldLight, fontFamily: F.head, fontSize: 12, letterSpacing: 0.5, flex: 1 },
  time: { color: C.textDim, fontFamily: F.bodyB, fontSize: 13, marginRight: 12, fontVariant: ['tabular-nums'] },
  menu: { width: 34, height: 24, borderRadius: 6, borderWidth: 1, borderColor: C.goldDark, alignItems: 'center', justifyContent: 'center', backgroundColor: C.wood2 },
  menuTxt: { color: C.goldLight, fontSize: 18, lineHeight: 20, fontWeight: '700' },
});
