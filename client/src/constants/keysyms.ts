// X11 keysym constants for special key combos sent via Guacamole
export const KEYSYMS = {
  CTRL_ALT_DEL: [0xFFE3, 0xFFE9, 0xFFFF],
  ALT_TAB: [0xFFE9, 0xFF09],
  ALT_F4: [0xFFE9, 0xFFC1],
  WINDOWS: [0xFFEB],
  PRINT_SCREEN: [0xFF61],
} as const;
