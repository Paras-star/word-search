import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header, Screen, PrimaryButton } from '@/components/GameUI';
import { useColors } from '@/hooks/useColors';

export default function RewardScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams<{ categoryId?: string; mode?: string; score?: string; time?: string; puzzleId?: string }>();
  return <Screen>
    <Header title="Reward gateway" />
    <View style={styles.content}>
      <View style={[styles.icon, { backgroundColor: colors.accent }]}><Text style={[styles.iconText, { color: colors.orange }]}>?</Text></View>
      <Text style={[styles.kicker, { color: colors.orange }]}>PUZZLE COMPLETE</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>Mystery reward</Text>
      <Text style={[styles.copy, { color: colors.mutedForeground }]}>Your reward is ready. This experience is intentionally kept separate from the Word Hunt engine.</Text>
      <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>FINAL SCORE</Text><Text style={[styles.summaryScore, { color: colors.foreground }]}>{params.score ?? '0'}</Text></View>
      <PrimaryButton onPress={() => router.replace({ pathname: '/results', params })} testID="reward-continue">CONTINUE</PrimaryButton>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 13, paddingBottom: 70 },
  icon: { width: 92, height: 92, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  iconText: { fontFamily: 'Inter_700Bold', fontSize: 55 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.5 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 34 },
  copy: { maxWidth: 300, textAlign: 'center', fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 23 },
  summary: { width: '100%', alignItems: 'center', borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 10, marginBottom: 10 },
  summaryLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  summaryScore: { fontFamily: 'Inter_700Bold', fontSize: 27, marginTop: 3 },
});