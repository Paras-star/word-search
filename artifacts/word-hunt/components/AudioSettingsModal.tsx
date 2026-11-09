import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SoftButton } from '@/components/GameUI';
import { VolumeSlider } from '@/components/VolumeSlider';
import { homeColors } from '@/constants/homePalette';
import { useAudioSettings } from '@/hooks/useAudioSettings';
import { retryAudioSettingsSave, setAudioVolume } from '@/services/audioSettings';
import { INFORMATION_LINKS, openInformationLink } from '@/services/informationLinks';

export function AudioSettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { musicVolume, soundEffectsVolume, hydrated, saving, error } = useAudioSettings();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss settings" />
      <View style={styles.card} accessibilityViewIsModal>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator>
        <Text style={styles.title} accessibilityRole="header">Settings</Text>
        <Text style={styles.sectionTitle} accessibilityRole="header">Audio Settings</Text>
        <VolumeSlider testID="music-volume-slider" icon="🎵" label="Background Music" value={musicVolume} disabled={!hydrated} onChange={(v) => setAudioVolume('musicVolume', v)} />
        <VolumeSlider testID="sound-effects-volume-slider" icon="🔊" label="Game Sounds" value={soundEffectsVolume} disabled={!hydrated} onChange={(v) => setAudioVolume('soundEffectsVolume', v)} />
        <View style={styles.status} accessibilityLiveRegion="polite">
          {!hydrated ? <Text style={styles.statusText}>Loading settings…</Text>
            : error ? <View style={styles.errorRow}><Text style={[styles.statusText, styles.errorText]}>{error}</Text>
              <Pressable onPress={retryAudioSettingsSave} accessibilityRole="button" accessibilityLabel="Retry saving" testID="settings-retry-button" hitSlop={8} style={styles.retry}><Text style={styles.retryText}>RETRY</Text></Pressable></View>
            : saving ? <Text style={styles.statusText}>Saving…</Text> : <Text style={styles.statusText}> </Text>}
        </View>
        <View style={styles.information}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Information &amp; Support</Text>
          {INFORMATION_LINKS.map((link) => (
            <Pressable
              key={link.id}
              accessibilityRole="link"
              accessibilityLabel={link.label}
              accessibilityHint={link.id === 'support' ? 'Opens your email app' : 'Opens in your browser'}
              testID={`settings-${link.id}-link`}
              onPress={() => { void openInformationLink(link); }}
              style={({ pressed }) => [styles.linkRow, pressed && styles.linkPressed]}
            >
              <Text style={styles.linkText}>{link.label}</Text>
              <Text style={styles.linkArrow} importantForAccessibility="no">›</Text>
            </Pressable>
          ))}
        </View>
        <SoftButton onPress={onClose} suppressClickSound testID="settings-close-button" accessibilityLabel="Close settings" style={styles.close}>CLOSE</SoftButton>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(21,61,72,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 400, maxHeight: '90%', borderRadius: 24, borderWidth: 1, borderColor: homeColors.tileBorder, backgroundColor: homeColors.background, overflow: 'hidden' },
  content: { padding: 22, gap: 14 },
  title: { color: homeColors.ink, fontFamily: 'Inter_700Bold', fontSize: 22, textAlign: 'center' },
  sectionTitle: { color: homeColors.ink, fontFamily: 'Inter_700Bold', fontSize: 16 },
  information: { borderTopWidth: 1, borderTopColor: homeColors.tileBorder, paddingTop: 16, gap: 10 },
  linkRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: homeColors.tileBorder, backgroundColor: homeColors.tile },
  linkPressed: { opacity: 0.7 },
  linkText: { flex: 1, color: homeColors.teal, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  linkArrow: { color: homeColors.teal, fontSize: 22 },
  status: { minHeight: 28, justifyContent: 'center', alignItems: 'center' },
  statusText: { color: homeColors.softInk, fontFamily: 'Inter_500Medium', fontSize: 13 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { flex: 1, color: homeColors.gold },
  retry: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  retryText: { color: homeColors.teal, fontFamily: 'Inter_700Bold', fontSize: 13 },
  close: { backgroundColor: homeColors.tile, borderColor: homeColors.tealBorder },
});
