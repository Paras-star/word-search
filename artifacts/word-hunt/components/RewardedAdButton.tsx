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
  onDismiss?: () => void;
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

export const UNAVAILABLE_MESSAGE = 'No ads at the moment';

const FEEDBACK: Partial<Record<RewardedUiStatus, string>> = {
  pending: 'LOADING AD',
  earned: 'ADDED',
  closed: 'NO REWARD',
  unavailable: UNAVAILABLE_MESSAGE,
  failed: 'TRY AGAIN',
};

export function RewardedAdButton({ label, reward, status, loading = false, onPress, onDismiss, variant = 'chip', source, artworkSize = 64, emphasized, disabled, testID, accessibilityLabel, style }: Props) {
  // An unavailable message replaces the action; dismissing it never requests an ad.
  const pending = status === 'pending' || loading;
  const blocked = pending || !!disabled;
  const unavailable = status === 'unavailable';
  const feedback = status === 'idle' && loading ? 'LOADING AD' : FEEDBACK[status];
  const replacementProps = {
    onPress: () => onDismiss?.(),
    accessibilityRole: 'button' as const,
    accessibilityLabel: `${UNAVAILABLE_MESSAGE}. Dismiss`,
    accessibilityHint: 'Dismiss this message to restore the reward button',
    testID: testID ? `${testID}-unavailable` : undefined,
  };
  useEffect(() => {
    if (status === 'earned') AccessibilityInfo.announceForAccessibility(`${reward} added`);
    else if (status === 'unavailable') AccessibilityInfo.announceForAccessibility(UNAVAILABLE_MESSAGE);
    else if (status === 'closed') AccessibilityInfo.announceForAccessibility('Ad closed before the reward was earned.');
    else if (status === 'failed') AccessibilityInfo.announceForAccessibility('Reward could not be saved. Please try again.');
  }, [status, reward]);
  if (variant === 'artwork' && source) {
    return <View style={[styles.artWrap, { width: artworkSize, height: artworkSize }, style]}>
      {unavailable ? <Pressable {...replacementProps} style={styles.artMessage}>
        <Text style={styles.messageText} numberOfLines={4} accessibilityLiveRegion="polite">{UNAVAILABLE_MESSAGE}</Text>
      </Pressable> : <Pressable
        onPress={() => { if (!blocked) onPress(); }}
        disabled={blocked}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `${label} ${reward}`}
        accessibilityState={{ disabled: blocked, busy: pending }}
        testID={testID}
        style={({ pressed }) => ({ width: artworkSize, height: artworkSize, opacity: pressed ? 0.8 : blocked && !pending ? 0.6 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}
      >
        <Image source={source} style={{ width: artworkSize, height: artworkSize }} resizeMode="contain" />
        {(pending || feedback) && <View pointerEvents="none" style={styles.artFeedback}>
          {pending && <ActivityIndicator size="small" color={homeColors.teal} />}
          {feedback && <Text style={styles.artFeedbackText} numberOfLines={2} accessibilityLiveRegion="polite">{feedback}</Text>}
        </View>}
      </Pressable>}
    </View>;
  }
  const bar = variant === 'bar';
  const filled = bar && emphasized;
  const fg = filled ? homeColors.tile : homeColors.teal;
  if (unavailable) return <Pressable {...replacementProps}
    style={[bar ? styles.bar : styles.chip, filled && styles.barFilled, style]}>
    <Text style={[styles.messageText, { color: fg }]} numberOfLines={2} accessibilityLiveRegion="polite">{UNAVAILABLE_MESSAGE}</Text>
  </Pressable>;
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
      ? <Text style={[bar ? styles.barText : styles.chipText, { color: status === 'earned' ? (filled ? homeColors.tile : homeColors.teal) : fg }]} numberOfLines={1} accessibilityLiveRegion="polite">{feedback}</Text>
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
  artMessage: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  messageText: { color: homeColors.teal, fontFamily: 'Inter_600SemiBold', fontSize: 11.5, lineHeight: 14, textAlign: 'center', flexShrink: 1 },
  artFeedback: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', backgroundColor: homeColors.tile },
  artFeedbackText: { color: homeColors.teal, fontFamily: 'Inter_700Bold', fontSize: 9, lineHeight: 11, textAlign: 'center' },
  textRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  bar: { minHeight: 44, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1, borderColor: homeColors.tealBorder, backgroundColor: homeColors.tile, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  barFilled: { backgroundColor: homeColors.teal, borderColor: homeColors.teal },
  barText: { fontFamily: 'Inter_700Bold', fontSize: 11.5, letterSpacing: 0.3 },
  barReward: { fontFamily: 'Inter_700Bold', fontSize: 11.5 },
});
