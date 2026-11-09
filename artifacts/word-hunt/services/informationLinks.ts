import { Alert, Linking } from 'react-native';

export const INFORMATION_LINKS = [
  { id: 'support', label: 'Support', url: 'mailto:wordhuntmysterydumpling@gmail.com' },
  { id: 'privacy-policy', label: 'Privacy Policy', url: 'https://paras-star.github.io/word-hunt-privacy-policy/' },
  { id: 'terms-of-service', label: 'Terms of Service', url: 'https://paras-star.github.io/word-hunt-privacy-policy/terms.html' },
] as const;

export async function openInformationLink(link: typeof INFORMATION_LINKS[number]): Promise<boolean> {
  try {
    // Dispatch directly from the tap: React Native uses the OS handler on Android
    // and opens a browser tab on web. No embedded browser or intent queries needed.
    await Linking.openURL(link.url);
    return true;
  } catch {
    Alert.alert(
      `Unable to open ${link.label}`,
      link.id === 'support'
        ? 'Please set up an email app or email wordhuntmysterydumpling@gmail.com.'
        : `Please open this address in your browser: ${link.url}`,
    );
    return false;
  }
}
