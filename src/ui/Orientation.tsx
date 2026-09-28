import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';
import { Image, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SOURCES } from '../render/manifest';
import { C, F } from './theme';

/** Locks native builds to landscape. (Web cannot be locked without fullscreen — see requestLandscape.) */
export function useLandscapeLock() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
  }, []);
}

/** Web: go fullscreen and try to lock landscape (works on Android Chrome; iOS Safari shows the rotate hint instead). */
export function requestLandscape() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
  const isTouch = typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0;
  if (!isTouch) return;
  const lock = () => {
    const so = (screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } }).orientation;
    so?.lock?.('landscape').catch(() => {});
  };
  if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().then(lock).catch(lock);
  else lock();
}

/** Full-screen "rotate your phone" prompt shown on touch devices held upright. */
export function RotateHint() {
  const { width, height } = useWindowDimensions();
  const isTouch = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0);
  if (!isTouch || width >= height) return null;
  return (
    <View style={s.wrap}>
      <Image source={SOURCES.ui_menu_bg} style={s.bg} blurRadius={6} />
      <View style={s.shade} />
      <Text style={s.icon}>⟳</Text>
      <Text style={s.title}>Telefonunu yatay çevir</Text>
      <Text style={s.sub}>Krallıklar Çağı yatay ekranda oynanır.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, zIndex: 100 },
  bg: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%', height: '100%', resizeMode: 'cover' },
  shade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(8,5,2,0.6)' },
  icon: { fontSize: 72, color: C.goldLight, transform: [{ rotate: '90deg' }] },
  title: { fontFamily: F.titleB, fontSize: 24, color: C.goldLight, marginTop: 12, textAlign: 'center' },
  sub: { fontFamily: F.body, fontSize: 15, color: C.parchment, marginTop: 6, textAlign: 'center' },
});
