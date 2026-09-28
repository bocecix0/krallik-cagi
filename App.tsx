import { AlegreyaSans_500Medium, AlegreyaSans_800ExtraBold } from '@expo-google-fonts/alegreya-sans';
import { Cinzel_700Bold, Cinzel_900Black } from '@expo-google-fonts/cinzel';
import { CinzelDecorative_700Bold, CinzelDecorative_900Black } from '@expo-google-fonts/cinzel-decorative';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { MapStyle } from './src/game/mapgen';
import type { Difficulty } from './src/game/types';
import { sound } from './src/audio/sound';
import { loadAll, type Loaded } from './src/render/loader';
import { GameScreen } from './src/ui/GameScreen';
import { MainMenu } from './src/ui/MainMenu';
import { RotateHint, requestLandscape, useLandscapeLock } from './src/ui/Orientation';
import { C } from './src/ui/theme';

type Settings = { difficulty: Difficulty; style: MapStyle; seed: number };

export default function App() {
  const [fontsLoaded] = useFonts({ AlegreyaSans_500Medium, AlegreyaSans_800ExtraBold, Cinzel_700Bold, Cinzel_900Black, CinzelDecorative_700Bold, CinzelDecorative_900Black });
  const [assets, setAssets] = useState<Loaded | null>(null);
  const [progress, setProgress] = useState(0);
  const [game, setGame] = useState<Settings | null>(null);
  useLandscapeLock();

  useEffect(() => {
    loadAll(AlegreyaSans_800ExtraBold as number, setProgress).then(setAssets);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" hidden={!!game} />
        {!fontsLoaded ? (
          <View style={{ flex: 1, backgroundColor: C.bg }} />
        ) : game && assets ? (
          <GameScreen
            key={game.seed}
            assets={assets}
            settings={game}
            onExit={() => setGame(null)}
            onRestart={() => setGame({ ...game, seed: Math.floor(Math.random() * 1e9) })}
          />
        ) : (
          <MainMenu progress={progress} ready={!!assets} onStart={(g) => { requestLandscape(); sound.init(); sound.startMusic(); setGame(g); }} />
        )}
        <RotateHint />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
