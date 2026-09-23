import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { RES_NAMES } from '../game/data';
import type { Res } from '../game/types';
import type { GameEvent, World } from '../game/world';
import { SOURCES } from '../render/manifest';
import { C, F } from './theme';
import { fmtTime } from './TopBar';

export function Toasts({ events, time, onPress }: { events: GameEvent[]; time: number; onPress: (x: number, y: number) => void }) {
  const recent = events.filter((e) => time - e.t < 7).slice(-3);
  return (
    <View style={s.toasts} pointerEvents="box-none">
      {recent.map((e, i) => (
        <Pressable key={`${e.t}-${i}`} onPress={() => e.x !== undefined && onPress(e.x, e.y ?? 0)}
          style={[s.toast, e.kind === 'warn' && s.toastWarn, e.kind === 'good' && s.toastGood, { opacity: Math.min(1, (7 - (time - e.t)) / 2) }]}>
          <Text style={s.toastTxt}>{e.text}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function MenuButton({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.btn, primary && s.btnPrimary, pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 }]}>
      <Text style={[s.btnTxt, primary && { color: C.ink }]}>{label}</Text>
    </Pressable>
  );
}

export function PauseOverlay({ speed, onSpeed, onResume, onRestart, onExit }: { speed: number; onSpeed: (v: number) => void; onResume: () => void; onRestart: () => void; onExit: () => void }) {
  return (
    <View style={s.backdrop}>
      <View style={s.card}>
        <Text style={s.title}>Duraklatıldı</Text>
        <Text style={s.label}>Oyun Hızı</Text>
        <View style={s.speedRow}>
          {[0.75, 1, 1.5, 2].map((v) => (
            <Pressable key={v} onPress={() => onSpeed(v)} style={[s.speed, speed === v && s.speedOn]}>
              <Text style={[s.speedTxt, speed === v && { color: C.ink }]}>{v}x</Text>
            </Pressable>
          ))}
        </View>
        <MenuButton label="Devam Et" primary onPress={onResume} />
        <MenuButton label="Yeniden Başlat" onPress={onRestart} />
        <MenuButton label="Ana Menü" onPress={onExit} />
      </View>
    </View>
  );
}

export function EndOverlay({ world, onRestart, onExit }: { world: World; onRestart: () => void; onExit: () => void }) {
  const won = world.winner === 1;
  const me = world.players[1], ai = world.players[2];
  const rows: [string, string, string][] = [
    ['Eğitilen birim', String(me.stats.trained), String(ai.stats.trained)],
    ['Öldürülen', String(me.stats.killed), String(ai.stats.killed)],
    ['Kaybedilen', String(me.stats.lost), String(ai.stats.lost)],
    ['İnşa edilen', String(me.stats.built), String(ai.stats.built)],
    ...(['food', 'wood', 'gold', 'stone'] as Res[]).map((r): [string, string, string] => [RES_NAMES[r], String(me.stats.gathered[r]), String(ai.stats.gathered[r])]),
  ];
  return (
    <View style={s.backdrop}>
      <View style={s.card}>
        <Image source={won ? SOURCES.icon_age4 : SOURCES.bld_rubble} style={s.endImg} />
        <Text style={[s.title, { color: won ? C.goldLight : '#ff8a7a' }]}>{won ? 'ZAFER!' : 'YENİLGİ'}</Text>
        <Text style={s.sub}>{won ? 'Rakip krallık yıkıldı.' : 'Krallığın düştü.'} · {fmtTime(world.time)}</Text>
        <View style={s.table}>
          <View style={s.tr}><Text style={[s.td, s.th, { flex: 2 }]} /><Text style={[s.td, s.th, { color: '#7fb0ff' }]}>Sen</Text><Text style={[s.td, s.th, { color: '#ff8a7a' }]}>Rakip</Text></View>
          {rows.map((r) => (
            <View key={r[0]} style={s.tr}><Text style={[s.td, { flex: 2, textAlign: 'left' }]}>{r[0]}</Text><Text style={s.td}>{r[1]}</Text><Text style={s.td}>{r[2]}</Text></View>
          ))}
        </View>
        <MenuButton label="Tekrar Oyna" primary onPress={onRestart} />
        <MenuButton label="Ana Menü" onPress={onExit} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  toasts: { gap: 4, maxWidth: 205 },
  toast: { alignSelf: 'flex-start', backgroundColor: 'rgba(20,14,9,0.85)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderLeftWidth: 3, borderColor: C.gold },
  toastWarn: { borderColor: C.red },
  toastGood: { borderColor: C.green },
  toastTxt: { color: C.text, fontFamily: F.bodyB, fontSize: 12.5 },
  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, backgroundColor: C.wood, borderRadius: 14, borderWidth: 2, borderColor: C.gold, padding: 20, alignItems: 'stretch' },
  title: { fontFamily: F.title, fontSize: 28, color: C.goldLight, textAlign: 'center', marginBottom: 6 },
  sub: { fontFamily: F.body, color: C.textDim, textAlign: 'center', marginBottom: 12 },
  label: { fontFamily: F.head, color: C.textDim, fontSize: 12, marginTop: 8, marginBottom: 6, textAlign: 'center' },
  speedRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  speed: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.goldDark, alignItems: 'center' },
  speedOn: { backgroundColor: C.gold, borderColor: C.goldLight },
  speedTxt: { color: C.text, fontFamily: F.bodyB },
  btn: { height: 50, borderRadius: 10, borderWidth: 1.5, borderColor: C.goldDark, backgroundColor: C.wood2, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  btnPrimary: { backgroundColor: C.gold, borderColor: C.goldLight },
  btnTxt: { fontFamily: F.head, fontSize: 16, color: C.text },
  endImg: { width: 90, height: 90, alignSelf: 'center', resizeMode: 'contain' },
  table: { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 8, marginBottom: 6 },
  tr: { flexDirection: 'row', paddingVertical: 2 },
  td: { flex: 1, color: C.text, fontFamily: F.body, fontSize: 13, textAlign: 'right' },
  th: { fontFamily: F.bodyB },
});
