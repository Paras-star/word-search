import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

const logo = require('../assets/images/splash-logo.png');

export function BrandLoading() {
  return (
    <View style={styles.screen}>
      <Image source={logo} style={styles.logo} resizeMode="contain" accessibilityLabel="Word Hunt : Mystery Dumpling" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  logo: { width: 220, height: 220 },
});