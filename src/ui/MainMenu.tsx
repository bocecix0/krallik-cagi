import { useState } from 'react';
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MapStyle } from '../game/mapgen';
import type { Difficulty } from '../game/types';
import { SOURCES } from '../render/manifest';
import { C, F } from './theme';

interface Props {
  progress: number;
  ready: boolean;
  onStart: (s: { difficulty: Difficulty; style: MapStyle; seed: number }) => void;
}

function Chip<T extends string>({ value, cur, label, onPress }: { value: T; cur: T; label: string; onPress: (v: T) => void }) {
  const on = value === cur;
  return (
    <Pressable onPress={() => onPress(value)} style={[s.chip, on && s.chipOn]}>
      <Text style={[s.chipTxt, on && { color: C.ink }]}>{label}</Text>
    </Pressable>
  );
}

const TIPS: [string, string][] = [
  ['icon_food', 'Köylüler yiyecek, odun, altın ve taş toplar. Köylü seçip bir kaynağa dokun.'],
  ['icon_hammer', 'Köylü seçiliyken alt paneldeki bina simgesine dokun, haritada yer seç ve "İnşa Et".'],
  ['icon_pop', 'Her ev +5 nüfus sağlar. Nüfus dolunca üretim durur.'],
  ['icon_age2', 'Şehir Merkezinden çağ atla. Her çağ için 2 farklı bina gerekir.'],
  ['icon_sword', 'Askeri birim seçip düşmana dokun: saldırır. Basılı tut + sürükle: alan seçimi.'],
  ['icon_age4', 'Rakibin tüm binalarını ve birimlerini yok ederek kazan.'],
];

export function MainMenu({ progress, ready, onStart }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'home' | 'setup' | 'help'>('home');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [style, setStyle] = useState<MapStyle>('goller');

  return (
    <ImageBackground source={SOURCES.ui_menu_bg} style={s.bg} resizeMode="cover">
      <View style={s.shade} />
      <View style={[s.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
        <View style={s.titleWrap}>
          <Text style={s.kicker}>— BİR STRATEJİ DESTANI —</Text>
          <Text style={s.title}>Krallıklar</Text>
          <Text style={s.title2}>Çağı</Text>
          <View style={s.rule} />
          <Text style={s.tag}>Dikey · İzometrik · Gerçek zamanlı strateji</Text>
        </View>

        <View style={s.bottom}>
          {step === 'home' && (
            <>
              <Btn primary label={ready ? 'Oyna' : `Yükleniyor %${Math.floor(progress * 100)}`} disabled={!ready} onPress={() => setStep('setup')} />
              <Btn label="Nasıl Oynanır" onPress={() => setStep('help')} />
              {!ready && <View style={s.bar}><View style={[s.barFill, { width: `${progress * 100}%` }]} /></View>}
            </>
          )}
          {step === 'setup' && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Serbest Oyun</Text>
              <Text style={s.label}>Zorluk</Text>
              <View style={s.row}>
                <Chip value="easy" cur={difficulty} label="Kolay" onPress={setDifficulty} />
                <Chip value="normal" cur={difficulty} label="Normal" onPress={setDifficulty} />
                <Chip value="hard" cur={difficulty} label="Zor" onPress={setDifficulty} />
              </View>
              <Text style={s.label}>Harita</Text>
              <View style={s.row}>
                <Chip value="goller" cur={style} label="Göller" onPress={setStyle} />
                <Chip value="anadolu" cur={style} label="Anadolu Bozkırı" onPress={setStyle} />
              </View>
              <View style={s.civ}>
                <Image source={SOURCES.unit_knight} style={s.civImg} />
                <View style={{ flex: 1 }}>
                  <Text style={s.civName}>Mavi Krallık</Text>
                  <Text style={s.civDesc}>Sen · Rakip: Kızıl Krallık (Yapay Zekâ)</Text>
                </View>
                <Image source={SOURCES.unit_knight_red} style={[s.civImg, { transform: [{ scaleX: -1 }] }]} />
              </View>
              <Btn primary label="Savaşa Başla" onPress={() => onStart({ difficulty, style, seed: Math.floor(Math.random() * 1e9) })} />
              <Btn label="Geri" onPress={() => setStep('home')} />
            </View>
          )}
          {step === 'help' && (
            <View style={[s.card, { maxHeight: 460 }]}>
              <Text style={s.cardTitle}>Nasıl Oynanır</Text>
              <ScrollView>
                {TIPS.map(([icon, txt]) => (
                  <View key={icon} style={s.tip}>
                    <Image source={SOURCES[icon]} style={s.tipImg} />
                    <Text style={s.tipTxt}>{txt}</Text>
                  </View>
                ))}
              </ScrollView>
              <Btn label="Geri" onPress={() => setStep('home')} />
            </View>
          )}
        </View>
      </View>
    </ImageBackground>
  );
}

function Btn({ label, onPress, primary, disabled }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [s.btn, primary && s.btnPrimary, disabled && { opacity: 0.6 }, pressed && { transform: [{ scale: 0.97 }] }]}>
      <Text style={[s.btnTxt, primary && s.btnTxtPrimary]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: C.bg, overflow: 'hidden' },
  shade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(8,5,2,0.25)' },
  content: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 22 },
  titleWrap: { alignItems: 'center' },
  kicker: { fontFamily: F.head, color: C.parchment, fontSize: 11, letterSpacing: 3, opacity: 0.9, textShadowColor: '#000', textShadowRadius: 6 },
  title: { fontFamily: F.title, color: C.goldLight, fontSize: 42, lineHeight: 52, marginTop: 6, textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 3 } },
  title2: { fontFamily: F.title, color: C.goldLight, fontSize: 38, lineHeight: 44, marginTop: -6, textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 3 } },
  rule: { width: 180, height: 2, backgroundColor: C.gold, marginVertical: 10, opacity: 0.8 },
  tag: { fontFamily: F.body, color: C.parchment, fontSize: 14, textShadowColor: '#000', textShadowRadius: 6 },
  bottom: { gap: 10 },
  btn: { height: 56, borderRadius: 12, borderWidth: 1.5, borderColor: C.gold, backgroundColor: 'rgba(28,20,12,0.88)', alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: C.gold, borderColor: C.goldLight, shadowColor: C.gold, shadowOpacity: 0.5, shadowRadius: 12 },
  btnTxt: { fontFamily: F.head, fontSize: 18, color: C.text, letterSpacing: 1 },
  btnTxtPrimary: { color: C.ink, fontFamily: F.headX },
  bar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.5)', overflow: 'hidden' },
  barFill: { height: 4, backgroundColor: C.gold },
  card: { backgroundColor: 'rgba(28,20,12,0.94)', borderRadius: 14, borderWidth: 1.5, borderColor: C.gold, padding: 16, gap: 4 },
  cardTitle: { fontFamily: F.titleB, fontSize: 22, color: C.goldLight, textAlign: 'center', marginBottom: 4 },
  label: { fontFamily: F.head, color: C.textDim, fontSize: 12, marginTop: 8, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.goldDark, alignItems: 'center', backgroundColor: C.wood2 },
  chipOn: { backgroundColor: C.gold, borderColor: C.goldLight },
  chipTxt: { color: C.text, fontFamily: F.bodyB, fontSize: 14 },
  civ: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 8 },
  civImg: { width: 54, height: 54, resizeMode: 'contain' },
  civName: { fontFamily: F.head, color: C.goldLight, fontSize: 15, textAlign: 'center' },
  civDesc: { fontFamily: F.body, color: C.textDim, fontSize: 12, textAlign: 'center' },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderColor: 'rgba(212,169,74,0.15)' },
  tipImg: { width: 38, height: 38, resizeMode: 'contain' },
  tipTxt: { flex: 1, color: C.text, fontFamily: F.body, fontSize: 14, lineHeight: 19 },
});
