import '@expo/metro-runtime';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { registerRootComponent } from 'expo';

// Skia on web needs CanvasKit (wasm) loaded before any Skia API is touched.
LoadSkiaWeb({ locateFile: (file: string) => `/${file}` }).then(async () => {
  const App = (await import('./App')).default;
  registerRootComponent(App);
});
