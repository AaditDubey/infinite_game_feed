// Every color, spacing value and font size in the app comes from here (light theme only).
export const theme = {
  colors: {
    background: '#FFFFFF',
    text: '#1A1A1A',
    textMuted: '#6B6B6B',

    // Board lines: the board's background shows through the gaps between cells.
    boxLine: '#3A3A3A',
    cellLine: '#C8CDD3',

    // Cell backgrounds, by highlight.
    cell: '#FFFFFF',
    cellSelected: '#A9CCF5',
    cellSameDigit: '#CFE0F5',
    cellPeer: '#EBF1F8',
    cellWrong: '#FBE3E3',
    unitComplete: '#4CAF50', // flashes over a completed row, column or box

    // Cell text.
    givenText: '#1A1A1A',
    entryText: '#1E5BB8',
    wrongText: '#C62828',
    noteText: '#6B6B6B',

    // Number pad and toolbar buttons.
    button: '#EEF1F5',
    buttonPressed: '#DCE3EC',
    buttonText: '#1A1A1A',
    buttonTextDone: '#B8BDC4',
    buttonActive: '#1E5BB8',
    buttonActiveText: '#FFFFFF',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  fontSize: {
    sm: 14,
    md: 16,
    lg: 20,
    xl: 28,
  },
  board: {
    boxLineWidth: 2,
    cellLineWidth: 1,
    digitScale: 0.6, // a placed digit's font size, as a share of the cell's width
    noteScale: 0.26, // a note's font size, as a share of the cell's width
    flashMs: 600, // the green flash on a completed row, column or box, in and out
    flashOpacity: 0.45, // the flash's strongest green, over the cell's own background
  },
  button: {
    height: 52,
    radius: 8,
  },
} as const;
