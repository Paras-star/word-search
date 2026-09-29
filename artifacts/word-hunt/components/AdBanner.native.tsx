import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { ANDROID_AD_UNITS } from '@/services/adConfig';
import { canRequestAds, prepareAds, subscribeToAds } from '@/services/ads';

export function AdBanner() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [, setRevision] = useState(0);
  useEffect(() => {
    let mounted = true;
    const unsubscribe = subscribeToAds(() => { if (mounted) setRevision((value) => value + 1); });
    void prepareAds().then(() => { if (mounted) setReady(true); });
    return () => { mounted = false; unsubscribe(); };
  }, []);
  if (!ready || failed || !canRequestAds() || Platform.OS !== 'android' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  // Only require the module after confirming this is a native development/production build.
  let ads: typeof import('react-native-google-mobile-ads');
  try {
    ads = require('react-native-google-mobile-ads');
  } catch {
    return null;
  }
  return <View style={{ alignItems: 'center' }}>
    <ads.BannerAd
      unitId={__DEV__ ? ads.TestIds.BANNER : ANDROID_AD_UNITS.banner}
      size={ads.BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
      onAdFailedToLoad={() => setFailed(true)}
    />
  </View>;
}