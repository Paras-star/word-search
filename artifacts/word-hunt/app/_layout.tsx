import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GameProvider } from '@/context/GameProvider';
import { prepareAds } from '@/services/ads';
import { AppState, Platform } from 'react-native';
import { disposeAudio, initializeAudio, resumeBackgroundMusic, setAudioForeground, startBackgroundMusic } from '@/services/audio';
import { flushAudioSettings, initializeAudioSettings } from '@/services/audioSettings';
import { stopDumplingSounds } from '@/services/dumplingAudio';
import { prepareChestAssets } from '@/services/chestPreparation';
import { prepareChestAudio } from '@/services/audio';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="categories" />
      <Stack.Screen name="mode" />
      <Stack.Screen name="game" />
      <Stack.Screen name="daily" />
      <Stack.Screen name="reward" />
      <Stack.Screen name="treasure-chest" options={{ gestureEnabled: false }} />
      <Stack.Screen name="collection" />
      <Stack.Screen name="results" />
    </Stack>
  );
}

export default function RootLayout() {
  const [chestPrepared, setChestPrepared] = useState(Platform.OS === 'web');
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => { void prepareAds(); }, []);

  useEffect(() => {
    let mounted = true;
    const chestAssets = Platform.OS === 'web' ? Promise.resolve() : prepareChestAssets();
    // Attach the handler immediately; slow audio settings must not leave an
    // image preparation rejection unhandled.
    void chestAssets.catch(() => {});
    setAudioForeground(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
    void initializeAudioSettings().then(() => {
      if (!mounted) return;
      initializeAudio();
      void startBackgroundMusic();
      if (Platform.OS !== 'web') {
        void Promise.all([chestAssets, prepareChestAudio()]).catch(error => {
          console.warn('[Word Hunt chest] Startup preparation failed; chest retry is available.', error);
        }).finally(() => { if (mounted) setChestPrepared(true); });
      }
    });
    const subscription = AppState.addEventListener('change', (state) => {
      setAudioForeground(state === 'active');
      if (state !== 'active') {
        stopDumplingSounds();
        void flushAudioSettings();
      }
    });
    return () => {
      mounted = false;
      subscription.remove();
      stopDumplingSounds();
      disposeAudio();
    };
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && chestPrepared) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, chestPrepared]);

  if ((!fontsLoaded && !fontError) || !chestPrepared) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GameProvider>
            <GestureHandlerRootView style={{ flex: 1 }} onTouchStart={resumeBackgroundMusic}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </GameProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
