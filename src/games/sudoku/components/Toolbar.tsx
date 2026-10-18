import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme/theme';

import { useSudokuStore } from '../store';

export function Toolbar() {
  const notesMode = useSudokuStore((state) => state.notesMode);
  const undo = useSudokuStore((state) => state.undo);
  const eraseSelected = useSudokuStore((state) => state.eraseSelected);
  const toggleNotesMode = useSudokuStore((state) => state.toggleNotesMode);

  return (
    <View style={styles.toolbar}>
      <ToolButton label="Undo" onPress={undo} />
      <ToolButton label="Erase" onPress={eraseSelected} />
      <ToolButton
        label={notesMode ? 'Notes on' : 'Notes off'}
        onPress={toggleNotesMode}
        active={notesMode}
      />
    </View>
  );
}

interface ToolButtonProps {
  label: string;
  onPress: () => void;
  active?: boolean; // only the Notes switch uses this
}

function ToolButton({ label, onPress, active }: ToolButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
        active && styles.buttonActive,
      ]}
      accessibilityRole={active === undefined ? 'button' : 'switch'}
      accessibilityLabel={active === undefined ? label : 'Notes'}
      accessibilityState={active === undefined ? undefined : { checked: active }}
    >
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  button: {
    flex: 1,
    height: theme.button.height,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.button.radius,
    backgroundColor: theme.colors.button,
  },
  buttonPressed: {
    backgroundColor: theme.colors.buttonPressed,
  },
  buttonActive: {
    backgroundColor: theme.colors.buttonActive,
  },
  label: {
    fontSize: theme.fontSize.md,
    color: theme.colors.buttonText,
  },
  labelActive: {
    color: theme.colors.buttonActiveText,
  },
});
