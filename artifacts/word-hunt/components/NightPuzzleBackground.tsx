import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { getPreparedNightBackground, NIGHT_BACKGROUND_SOURCE, prepareNightBackground } from '@/services/nightBackgroundPreparation';

export function NightPuzzleBackground() {
  const [background, setBackground] = useState(() => ({
    image: getPreparedNightBackground(),
    failed: false,
  }));

  useEffect(() => {
    let active = true;
    // Never gate the puzzle. Web shares the prepared blob instead of starting
    // another PNG request; native keeps its immediate original-source path.
    void prepareNightBackground().then(image => {
      if (active) setBackground({ image, failed: false });
    }).catch(error => {
      console.warn('[Word Hunt background] Night preparation failed; using the source image.', error);
      if (active) setBackground({ image: null, failed: true });
    });
    return () => { active = false; };
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="night-background">
      <Image source={background.image ?? (Platform.OS !== 'web' || background.failed ? NIGHT_BACKGROUND_SOURCE : undefined)}
        style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
        contentFit="cover" contentPosition="center" transition={0} accessible={false} />
    </View>
  );
}
