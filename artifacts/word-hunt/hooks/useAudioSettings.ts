import { useSyncExternalStore } from 'react';
import { getAudioSettings, subscribeAudioSettings } from '@/services/audioSettings';

export function useAudioSettings() {
  return useSyncExternalStore(subscribeAudioSettings, getAudioSettings, getAudioSettings);
}