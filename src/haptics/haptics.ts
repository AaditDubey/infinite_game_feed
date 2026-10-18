import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// A light tap when a digit is wrong. Android's own haptics API is used there, as the Expo docs
// recommend. Haptics are a nice extra, so if a call fails it's ignored.
export function tapForMistake(): void {
  const tap =
    Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Virtual_Key)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  tap.catch(() => {});
}
