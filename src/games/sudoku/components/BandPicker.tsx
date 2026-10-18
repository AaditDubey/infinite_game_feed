import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme/theme';

import { useSudokuStore } from '../store';
import { BAND_LABELS, BANDS } from '../types';

// For testing: Phase 2's adaptive difficulty replaces it. Choosing another band starts a new
// puzzle straight away.
export function BandPicker() {
  const current = useSudokuStore((state) => state.band);
  const chooseBand = useSudokuStore((state) => state.chooseBand);

  return (
    <View style={styles.picker}>
      {BANDS.map((band) => {
        const active = band === current;
        return (
          <Pressable
            key={band}
            onPress={() => chooseBand(band)}
            style={({ pressed }) => [
              styles.option,
              pressed && styles.optionPressed,
              active && styles.optionActive,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${BAND_LABELS[band]} difficulty`}
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{BAND_LABELS[band]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  picker: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  option: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    borderRadius: theme.button.radius,
    backgroundColor: theme.colors.button,
  },
  optionPressed: {
    backgroundColor: theme.colors.buttonPressed,
  },
  optionActive: {
    backgroundColor: theme.colors.buttonActive,
  },
  label: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.buttonText,
  },
  labelActive: {
    color: theme.colors.buttonActiveText,
  },
});
