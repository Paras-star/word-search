import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const colors = useColors();
  return <View style={[styles.screen, { backgroundColor: colors.background }, style]}>{children}</View>;
}

type ButtonProps = Omit<PressableProps, 'style'> & { children: React.ReactNode; style?: StyleProp<ViewStyle> };

export function PrimaryButton({ children, style, disabled, ...props }: ButtonProps) {
  const colors = useColors();
  return <Pressable disabled={disabled} style={({ pressed }) => [styles.primaryButton, { backgroundColor: disabled ? colors.border : colors.primary, opacity: pressed ? 0.86 : 1 }, style]} {...props}><Text style={styles.primaryText}>{children}</Text></Pressable>;
}

export function SoftButton({ children, style, disabled, ...props }: ButtonProps) {
  const colors = useColors();
  return <Pressable disabled={disabled} style={({ pressed }) => [styles.softButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : disabled ? 0.5 : 1 }, style]} {...props}><Text style={[styles.softText, { color: colors.foreground }]}>{children}</Text></Pressable>;
}

export function CoinPill({ coins }: { coins: number }) {
  const colors = useColors();
  return <View style={[styles.coinPill, { backgroundColor: colors.accent }]} accessible accessibilityLabel={`${coins} coins`}>
    <View style={styles.coinIcon}><View style={styles.coinFace}><View style={styles.coinShine} /></View></View>
    <Text style={[styles.coinText, { color: colors.foreground }]}>{coins}</Text>
  </View>;
}

export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();
  const handleBack = () => {
    if (Platform.OS === 'web' && !router.canGoBack()) {
      router.replace(pathname === '/mode' || pathname === '/game' ? '/categories' : '/');
    } else {
      onBack?.();
    }
  };
  return <View style={styles.header}>{onBack ? <Pressable onPress={handleBack} hitSlop={12}><Feather name="arrow-left" size={24} color={colors.foreground} /></Pressable> : <View style={{ width: 24 }} />}<Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text><View style={styles.headerRight}>{right}</View></View>;
}

export function LoadingScreen() {
  const colors = useColors();
  return <Screen style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></Screen>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  headerRight: { minWidth: 24, alignItems: 'flex-end' },
  primaryButton: { minHeight: 56, paddingHorizontal: 28, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 16 },
  softButton: { minHeight: 52, paddingHorizontal: 22, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  softText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  coinPill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 18 },
  coinIcon: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: '#B77B18', backgroundColor: '#ECAA2D', alignItems: 'center', justifyContent: 'center' },
  coinFace: { width: 17, height: 17, borderRadius: 9, borderWidth: 1, borderColor: '#FFF0AF', backgroundColor: '#F6C445' },
  coinShine: { position: 'absolute', top: 3, left: 3, width: 5, height: 3, borderRadius: 3, backgroundColor: '#FFF6D2', transform: [{ rotate: '-25deg' }] },
  coinText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  sectionLabel: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
});