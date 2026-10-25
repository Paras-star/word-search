import React, { useEffect } from 'react';
import { AccessibilityInfo, ActivityIndicator, Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { homeColors } from '@/constants/homePalette';
import type { RewardedUiStatus } from '@/hooks/useRewardedAd';

type Props = {
  label: string;
  reward: string;
  status: RewardedUiStatus;
  loading?: boolean;
  onPress: () => void;
  variant?: 'chip' | 'bar' | 'artwork';
  /** Required for the artwork variant: the unmodified button artwork. */
  source?: ImageSourcePropType;
  artworkSize?: number;
  emphasized?: boolean;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export const UNAVAILABLE_MESSAGE = 'Ads not ready - please try later';

const FEEDBACK: Partial<Record<RewardedUiStatus, string>> = {
  pending: 'LOADING AD',
  earned: 'ADDED',
  closed: 'NO REWARD',
  unavailable: UNAVAILABLE_MESSAGE,
  failed: 'TRY AGAIN',
};

export function RewardedAdButton({ label, reward, status, loading = false, onPress, variant = 'chip', source, artworkSize = 132, emphasized, disabled, testID, accessibilityLabel, style }: Props) {
  // Block while presenting or while the SDK is still loading; an unavailable ad stays tappable for retry feedback.
  const pending = status === 'pending' || loading;
  const blocked = pending || !!disabled;
  const feedback = status === 'idle' && loading ? 'LOADING AD' : FEEDBACK[status];
  useEffect(() => {
    if (status === 'earned') AccessibilityInfo.announceForAccessibility(`${reward} added`);
    else if (status === 'unavailable') AccessibilityInfo.announceForAccessibility(UNAVAILABLE_MESSAGE);
    else if (status === 'closed') AccessibilityInfo.announceForAccessibility('Ad closed before the reward was earned.');
    else if (status === 'failed') AccessibilityInfo.announceForAccessibility('Reward could not be saved. Please try again.');
  }, [status, reward]);
  if (variant === 'artwork' && source) {
    return <View style={[styles.artWrap, style]}>
      <Pressable
        onPress={() => { if (!blocked) onPress(); }}
        disabled={blocked}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `${label} ${reward}`}
        accessibilityState={{ disabled: blocked, busy: pending }}
        testID={testID}
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : blocked && !pending ? 0.6 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}
      >
        <Image source={source} style={{ width: artworkSize, height: artworkSize }} resizeMode="contain" />
      </Pressable>
      <View style={[styles.artFeedback, { maxWidth: Math.max(artworkSize, 150) }]}>
        {pending && <ActivityIndicator size="small" color={homeColors.teal} />}
        {feedback && <Text style={[styles.artFeedbackText, status === 'unavailable' && styles.artFeedbackPlain]} numberOfLines={2} accessibilityLiveRegion="polite">{feedback}</Text>}
      </View>
    </View>;
  }
  const bar = variant === 'bar';
  const filled = bar && emphasized;
  const fg = filled ? homeColors.tile : homeColors.teal;
  return <Pressable
    onPress={() => { if (!blocked) onPress(); }}
    disabled={blocked}
    hitSlop={bar ? 0 : 4}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? `${label} ${reward}`}
    accessibilityState={{ disabled: blocked, busy: pending }}
    testID={testID}
    style={({ pressed }) => [bar ? styles.bar : styles.chip, filled && styles.barFilled, { opacity: pressed ? 0.75 : blocked && !pending ? 0.5 : 1 }, style]}
  >
    {pending ? <ActivityIndicator size="small" color={fg} /> : <Feather name="play-circle" size={bar ? 15 : 12} color={fg} />}
    {feedback
      ? <Text style={[bar ? styles.barText : styles.chipText, { color: status === 'earned' ? (filled ? homeColors.tile : homeColors.teal) : fg }]} numberOfLines={status === 'unavailable' ? 2 : 1} accessibilityLiveRegion="polite">{feedback}</Text>
      : <View style={styles.textRow}>
        <Text style={[bar ? styles.barText : styles.chipText, { color: fg }]} numberOfLines={1}>{label}</Text>
        <Text style={[bar ? styles.barReward : styles.chipReward, { color: filled ? homeColors.goldSoft : homeColors.gold }]} numberOfLines={1}>{reward}</Text>
      </View>}
  </Pressable>;
}

const styles = StyleSheet.create({
  chip: { height: 30, paddingHorizontal: 8, borderRadius: 11, borderWidth: 1, borderColor: homeColors.tealBorder, backgroundColor: homeColors.tile, flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipText: { fontFamily: 'Inter_700Bold', fontSize: 9.5, letterSpacing: 0.4 },
  chipReward: { fontFamily: 'Inter_700Bold', fontSize: 10.5 },
  artWrap: { alignItems: 'flex-start' },
  artFeedback: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2, paddingHorizontal: 4 },
  artFeedbackText: { flexShrink: 1, color: homeColors.teal, fontFamily: 'Inter_700Bold', fontSize: 10.5, lineHeight: 14, letterSpacing: 0.3 },
  artFeedbackPlain: { letterSpacing: 0, fontSize: 11.5 },
  textRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  bar: { minHeight: 44, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1, borderColor: homeColors.tealBorder, backgroundColor: homeColors.tile, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  barFilled: { backgroundColor: homeColors.teal, borderColor: homeColors.teal },
  barText: { fontFamily: 'Inter_700Bold', fontSize: 11.5, letterSpacing: 0.3 },
  barReward: { fontFamily: 'Inter_700Bold', fontSize: 11.5 },
});
