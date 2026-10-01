import React, { useEffect } from 'react';
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
import { AppState } from 'react-native';
import { disposeAudio, initializeAudio, setAudioForeground } from '@/services/audio';
import { stopDumplingSounds } from '@/services/dumplingAudio';

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
      <Stack.Screen name="collection" />
      <Stack.Screen name="results" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => { void prepareAds(); }, []);

  useEffect(() => {
    setAudioForeground(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
    initializeAudio();
    const subscription = AppState.addEventListener('change', (state) => {
      setAudioForeground(state === 'active');
      if (state !== 'active') stopDumplingSounds();
    });
    return () => {
      subscription.remove();
      stopDumplingSounds();
      disposeAudio();
    };
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GameProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
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
