import { useState } from 'react';
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MapStyle } from '../game/mapgen';
import type { CivId, Difficulty } from '../game/types';
import { CIVS, CIV_IDS } from '../game/civs';
import { SOURCES } from '../render/manifest';
import type { SaveData } from '../game/world';
import { summarize } from './save';
import { fmtTime } from './TopBar';
import { UNITS } from '../game/data';

const UNIT_NAME = Object.fromEntries(Object.entries(UNITS).map(([k, v]) => [k, v.name])) as Record<string, string>;
import { C, F } from './theme';

interface Props {
  progress: number;
  ready: boolean;
  onStart: (s: { difficulty: Difficulty; style: MapStyle; seed: number; civ: CivId }) => void;
  saved?: SaveData | null;
  onContinue?: (d: SaveData) => void;
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

export function MainMenu({ progress, ready, onStart, saved, onContinue }: Props) {
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const [step, setStep] = useState<'home' | 'setup' | 'help'>('home');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [style, setStyle] = useState<MapStyle>('goller');
  const [civ, setCiv] = useState<CivId>('turks');

  const land = win.width > win.height;
  const content = (
    <>
      {step === 'home' && (
        <>
          {saved && ready && onContinue && (() => {
            const sm = summarize(saved);
            return (
              <Pressable onPress={() => onContinue(saved)} style={({ pressed }) => [s.btn, s.btnPrimary, s.contBtn, pressed && { transform: [{ scale: 0.97 }] }]}>
                <Text style={[s.btnTxt, s.btnTxtPrimary]}>Devam Et</Text>
                <Text style={s.contSub}>{sm.civ} · {sm.age} · {fmtTime(sm.time)} · {sm.difficulty}</Text>
              </Pressable>
            );
          })()}
          <Btn primary={!saved} label={ready ? (saved ? 'Yeni Oyun' : 'Oyna') : `Yükleniyor %${Math.floor(progress * 100)}`} disabled={!ready} onPress={() => setStep('setup')} />
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
          <Text style={s.label}>Medeniyet</Text>
          <View style={s.civGrid}>
            {CIV_IDS.map((id) => (
              <Pressable key={id} onPress={() => setCiv(id)} style={[s.civCard, civ === id && s.civCardOn]}>
                <Image source={SOURCES[CIVS[id].icon]} style={s.civIcon} />
                <Text style={[s.civCardTxt, civ === id && { color: C.ink }]} numberOfLines={1}>{CIVS[id].name}</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.civ}>
            <Image source={SOURCES[`unit_${CIVS[civ].unique}`]} style={s.civImg} />
            <View style={{ flex: 1 }}>
              <Text style={s.civName}>{CIVS[civ].name} · {CIVS[civ].tagline}</Text>
              {CIVS[civ].bonuses.map((b) => <Text key={b} style={s.civDesc}>• {b}</Text>)}
              <Text style={s.civDesc}>Özel birim (Kale): {UNIT_NAME[CIVS[civ].unique]}</Text>
            </View>
          </View>
          <View style={land ? s.row : undefined}>
            <View style={land ? { flex: 1 } : undefined}><Btn label="Geri" onPress={() => setStep('home')} /></View>
            <View style={land ? { flex: 2 } : undefined}>
              <Btn primary label="Savaşa Başla" onPress={() => onStart({ difficulty, style, civ, seed: Math.floor(Math.random() * 1e9) })} />
            </View>
          </View>
        </View>
      )}
      {step === 'help' && (
        <View style={[s.card, { maxHeight: land ? win.height - 40 : 460 }]}>
          <Text style={s.cardTitle}>Nasıl Oynanır</Text>
          <ScrollView style={{ flexShrink: 1 }}>
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
    </>
  );
  const title = (
    <View style={s.titleWrap}>
      <Text style={s.kicker}>— BİR STRATEJİ DESTANI —</Text>
      <Text style={[s.title, land && { fontSize: 42, lineHeight: 50 }]}>Krallıklar</Text>
      <Text style={[s.title2, land && { fontSize: 38, lineHeight: 44 }]}>Çağı</Text>
      <View style={s.rule} />
      <Text style={s.tag}>İzometrik · Gerçek zamanlı strateji</Text>
    </View>
  );
  const bg = SOURCES.ui_menu_bg_land && land ? SOURCES.ui_menu_bg_land : SOURCES.ui_menu_bg;

  if (land) {
    return (
      <ImageBackground source={bg} style={s.bg} resizeMode="cover">
        <View style={s.shade} />
        <View style={[s.landRow, { paddingLeft: insets.left + 24, paddingRight: insets.right + 20, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
          <View style={s.landTitle}>{title}</View>
          <ScrollView style={s.landPanel} contentContainerStyle={s.landPanelInner} showsVerticalScrollIndicator={false}>
            {content}
          </ScrollView>
        </View>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground source={bg} style={s.bg} resizeMode="cover">
      <View style={s.shade} />
      <View style={[s.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
        {title}
        <View style={s.bottom}>{content}</View>
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
  contBtn: { height: 64 },
  contSub: { fontFamily: F.bodyB, fontSize: 12, color: C.ink, opacity: 0.8, marginTop: 1 },
  landRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 20 },
  landTitle: { flex: 1, minWidth: 0, flexShrink: 1, alignItems: 'center', justifyContent: 'center' },
  landPanel: { width: 360, maxWidth: '48%', flexGrow: 0 },
  landPanelInner: { flexGrow: 1, justifyContent: 'center', gap: 10, paddingVertical: 6 },
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
  civGrid: { flexDirection: 'row', gap: 6 },
  civCard: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: C.goldDark, backgroundColor: C.wood2 },
  civCardOn: { backgroundColor: C.gold, borderColor: C.goldLight },
  civIcon: { width: 34, height: 34, resizeMode: 'contain' },
  civCardTxt: { color: C.text, fontFamily: F.bodyB, fontSize: 11.5, marginTop: 2 },
  civ: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 8 },
  civImg: { width: 54, height: 54, resizeMode: 'contain' },
  civName: { fontFamily: F.head, color: C.goldLight, fontSize: 14, marginBottom: 2 },
  civDesc: { fontFamily: F.body, color: C.parchment, fontSize: 12 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderColor: 'rgba(212,169,74,0.15)' },
  tipImg: { width: 38, height: 38, resizeMode: 'contain' },
  tipTxt: { flex: 1, color: C.text, fontFamily: F.body, fontSize: 14, lineHeight: 19 },
});
