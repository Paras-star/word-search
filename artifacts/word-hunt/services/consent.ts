import { getNativeAdSdk } from '@/services/nativeAdSdk';

let consentCheck: Promise<boolean> | undefined;
let privacyRequired = false;

export function privacyOptionsRequired() {
  return privacyRequired;
}

export function consentAllowsAds(): Promise<boolean> {
  if (!consentCheck) {
    consentCheck = (async () => {
      const sdk = getNativeAdSdk();
      if (!sdk) return false;
      // UMP updates consent information at each app launch before any ad request.
      await sdk.AdsConsent.gatherConsent();
      const info = await sdk.AdsConsent.getConsentInfo();
      privacyRequired = info.privacyOptionsRequirementStatus === sdk.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
      return info.canRequestAds;
    })().catch(() => false);
  }
  return consentCheck;
}

export async function showPrivacyOptions(): Promise<boolean> {
  const sdk = getNativeAdSdk();
  if (!sdk || !privacyRequired) return false;
  try {
    await sdk.AdsConsent.showPrivacyOptionsForm();
    const info = await sdk.AdsConsent.getConsentInfo();
    privacyRequired = info.privacyOptionsRequirementStatus === sdk.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
    return true;
  } catch {
    return false;
  }
}

export async function canRequestAdsNow(): Promise<boolean> {
  const sdk = getNativeAdSdk();
  if (!sdk) return false;
  try {
    return (await sdk.AdsConsent.getConsentInfo()).canRequestAds;
  } catch {
    return false;
  }
}