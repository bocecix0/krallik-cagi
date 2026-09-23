import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { World } from '../game/world';
import { C, F } from './theme';

interface Goal { text: string; done: (w: World) => boolean }

const count = (w: World, type: string, built = true) => w.ownEntities(1).filter((e) => e.type === type && (!built || e.built || e.kind === 'unit')).length;

const GOALS: Goal[] = [
  { text: 'Köylülerini kaynaklara gönder (köylü seç → kaynağa dokun)', done: (w) => w.ownEntities(1).some((e) => e.type === 'villager' && e.order?.kind === 'gather') },
  { text: 'Şehir Merkezinden köylü üret (7 köylü)', done: (w) => count(w, 'villager') >= 7 },
  { text: 'Nüfus için bir Ev inşa et', done: (w) => count(w, 'house') >= 1 },
  { text: 'Ağaçların yanına Kereste Kampı kur', done: (w) => count(w, 'lumber_camp') >= 1 },
  { text: 'Yiyecek için Değirmen ya da Tarla kur', done: (w) => count(w, 'mill') + count(w, 'farm') >= 1 },
  { text: 'Kışla inşa et', done: (w) => count(w, 'barracks') >= 1 },
  { text: 'Feodal Çağa geç (Şehir Merkezi)', done: (w) => w.players[1].age >= 1 },
  { text: 'Okçuluk Alanı veya Ahır kur, ordu topla (8 asker)', done: (w) => w.ownEntities(1).filter((e) => e.kind === 'unit' && e.type !== 'villager').length >= 8 },
  { text: 'Kale Çağına geç', done: (w) => w.players[1].age >= 2 },
  { text: 'Rakibin Şehir Merkezini yık!', done: (w) => w.winner === 1 },
];

export function Objectives({ world }: { world: World }) {
  const [open, setOpen] = useState(true);
  const idx = GOALS.findIndex((g) => !g.done(world));
  if (idx < 0) return null;
  return (
    <Pressable onPress={() => setOpen((o) => !o)} style={s.wrap}>
      <View style={s.head}>
        <Text style={s.title}>Hedef {idx + 1}/{GOALS.length}</Text>
        <Text style={s.toggle}>{open ? '–' : '+'}</Text>
      </View>
      {open && <Text style={s.text}>{GOALS[idx].text}</Text>}
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { maxWidth: 205, backgroundColor: 'rgba(234,220,188,0.94)', borderRadius: 8, borderWidth: 1.5, borderColor: C.goldDark, paddingHorizontal: 9, paddingVertical: 6 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { fontFamily: F.head, fontSize: 11, color: C.ink, letterSpacing: 0.5 },
  toggle: { fontFamily: F.bodyB, color: C.ink, fontSize: 14 },
  text: { fontFamily: F.body, fontSize: 13, color: C.ink, marginTop: 2, lineHeight: 17 },
});
