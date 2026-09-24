import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { adsArePermitted, bannerUnitId, prepareAds, subscribeToAds } from '@/services/ads';
import { getNativeAdSdk } from '@/services/nativeAdSdk';

export function AdBanner() {
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeToAds(() => {
      if (active) setEnabled(adsArePermitted());
    });
    void prepareAds().then((allowed) => {
      if (active) setEnabled(allowed);
    });
    return () => { active = false; unsubscribe(); };
  }, []);
  const sdk = getNativeAdSdk();
  const unitId = bannerUnitId();
  if (!enabled || failed || !sdk || !unitId) return null;
  const Banner = sdk.BannerAd;
  return <View style={styles.slot}>
    <Banner unitId={unitId} size={sdk.BannerAdSize.ANCHORED_ADAPTIVE_BANNER} onAdFailedToLoad={() => setFailed(true)} />
  </View>;
}

const styles = StyleSheet.create({
  slot: { height: 60, alignItems: 'center', justifyContent: 'center' },
});