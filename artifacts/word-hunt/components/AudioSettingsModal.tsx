import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SoftButton } from '@/components/GameUI';
import { VolumeSlider } from '@/components/VolumeSlider';
import { homeColors } from '@/constants/homePalette';
import { useAudioSettings } from '@/hooks/useAudioSettings';
import { retryAudioSettingsSave, setAudioVolume } from '@/services/audioSettings';

export function AudioSettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { musicVolume, soundEffectsVolume, hydrated, saving, error } = useAudioSettings();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss settings" />
      <View style={styles.card} accessibilityViewIsModal>
        <Text style={styles.title} accessibilityRole="header">Audio Settings</Text>
        <VolumeSlider testID="music-volume-slider" icon="🎵" label="Background Music" value={musicVolume} disabled={!hydrated} onChange={(v) => setAudioVolume('musicVolume', v)} />
        <VolumeSlider testID="sound-effects-volume-slider" icon="🔊" label="Game Sounds" value={soundEffectsVolume} disabled={!hydrated} onChange={(v) => setAudioVolume('soundEffectsVolume', v)} />
        <View style={styles.status} accessibilityLiveRegion="polite">
          {!hydrated ? <Text style={styles.statusText}>Loading settings…</Text>
            : error ? <View style={styles.errorRow}><Text style={[styles.statusText, styles.errorText]}>{error}</Text>
              <Pressable onPress={retryAudioSettingsSave} accessibilityRole="button" accessibilityLabel="Retry saving" testID="settings-retry-button" hitSlop={8} style={styles.retry}><Text style={styles.retryText}>RETRY</Text></Pressable></View>
            : saving ? <Text style={styles.statusText}>Saving…</Text> : <Text style={styles.statusText}> </Text>}
        </View>
        <SoftButton onPress={onClose} suppressClickSound testID="settings-close-button" accessibilityLabel="Close settings" style={styles.close}>CLOSE</SoftButton>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(21,61,72,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 400, borderRadius: 24, borderWidth: 1, borderColor: homeColors.tileBorder, backgroundColor: homeColors.background, padding: 22, gap: 14 },
  title: { color: homeColors.ink, fontFamily: 'Inter_700Bold', fontSize: 22, textAlign: 'center' },
  status: { minHeight: 28, justifyContent: 'center', alignItems: 'center' },
  statusText: { color: homeColors.softInk, fontFamily: 'Inter_500Medium', fontSize: 13 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { flex: 1, color: homeColors.gold },
  retry: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  retryText: { color: homeColors.teal, fontFamily: 'Inter_700Bold', fontSize: 13 },
  close: { backgroundColor: homeColors.tile, borderColor: homeColors.tealBorder },
});
