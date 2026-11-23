import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { getPreparedNightBackground, NIGHT_BACKGROUND_SOURCE, prepareNightBackground } from '@/services/nightBackgroundPreparation';

export function NightPuzzleBackground() {
  const [background, setBackground] = useState(getPreparedNightBackground);

  useEffect(() => {
    let active = true;
    // The original source renders immediately; preparation never gates play.
    void prepareNightBackground().then(image => {
      if (active) setBackground(image);
    }).catch(error => {
      console.warn('[Word Hunt background] Night preparation failed; using the source image.', error);
    });
    return () => { active = false; };
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="night-background">
      <Image source={background ?? NIGHT_BACKGROUND_SOURCE}
        style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
        contentFit="cover" contentPosition="center" transition={0} accessible={false} />
    </View>
  );
}
