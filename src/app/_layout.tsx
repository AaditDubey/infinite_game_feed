import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

// Keeps the splash screen up until the saved game has loaded (see useRestore). It's called here,
// outside any component, because from inside one it can run after the splash screen has gone.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="dark" />
    </>
  );
}
