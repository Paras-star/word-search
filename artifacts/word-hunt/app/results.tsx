import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen, PrimaryButton, SoftButton } from '@/components/GameUI';
import { CATEGORIES, getCategory } from '@/data/categories';
import { nextCategoryId } from '@/game/progression';
import { formatTime } from '@/game/scoring';
import { useColors } from '@/hooks/useColors';

export default function ResultsScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams<{ categoryId?: string; mode?: string; score?: string; time?: string; gameOver?: string }>();
  const category = getCategory(params.categoryId);
  const gameOver = params.gameOver === '1';
  const nextId = nextCategoryId(category.id, CATEGORIES);
  return <Screen>
    <Header title={gameOver ? 'Time is up' : 'Hunt complete'} onBack={() => router.replace('/')} />
    <View style={styles.content}>
      <View style={[styles.icon, { backgroundColor: gameOver ? '#ffe4e4' : '#e4f7ec' }]}><Feather name={gameOver ? 'clock' : 'check'} size={40} color={gameOver ? colors.warning : colors.success} /></View>
      <Text style={[styles.title, { color: colors.foreground }]}>{gameOver ? 'Good try' : 'Nice work'}</Text>
      <Text style={[styles.copy, { color: colors.mutedForeground }]}>{gameOver ? 'The clock ran out before the hunt was complete.' : `${category.name} is cleared. Your next category is ready when you are.`}</Text>
      <View style={styles.stats}><View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.label, { color: colors.mutedForeground }]}>SCORE</Text><Text style={[styles.value, { color: colors.foreground }]}>{params.score ?? '0'}</Text></View><View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.label, { color: colors.mutedForeground }]}>TIME</Text><Text style={[styles.value, { color: colors.foreground }]}>{formatTime(Number(params.time ?? 0))}</Text></View><View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.label, { color: colors.mutedForeground }]}>COINS</Text><Text style={[styles.value, { color: gameOver ? colors.mutedForeground : colors.orange }]}>{gameOver ? '+0' : '+50'}</Text></View></View>
      {!gameOver && nextId && <PrimaryButton onPress={() => router.replace({ pathname: '/mode', params: { categoryId: nextId } })}>NEXT LEVEL</PrimaryButton>}
      <SoftButton onPress={() => router.replace({ pathname: '/mode', params: { categoryId: category.id } })}>PLAY AGAIN</SoftButton>
      <SoftButton onPress={() => router.replace('/')}>HOME</SoftButton>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 13, paddingBottom: 30 },
  icon: { width: 86, height: 86, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 34 },
  copy: { fontFamily: 'Inter_500Medium', textAlign: 'center', lineHeight: 22, fontSize: 15, maxWidth: 310, marginBottom: 8 },
  stats: { width: '100%', flexDirection: 'row', gap: 8, marginBottom: 8 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 13, alignItems: 'center' },
  label: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1 },
  value: { fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 4 },
});