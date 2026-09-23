export const C = {
  bg: '#0d0a07',
  wood: '#241a12',
  wood2: '#2f2319',
  woodLight: '#3d2e21',
  stone: '#3a342d',
  gold: '#d4a94a',
  goldLight: '#f2d383',
  goldDark: '#7d5f24',
  parchment: '#eadcbc',
  ink: '#2b1d10',
  text: '#f3e7cf',
  textDim: '#b5a488',
  blue: '#2f6fe0',
  red: '#d8342c',
  green: '#63c46f',
  warn: '#ffb347',
  shadow: 'rgba(0,0,0,0.55)',
};

export const F = {
  title: 'CinzelDecorative_900Black',
  titleB: 'CinzelDecorative_700Bold',
  head: 'Cinzel_700Bold',
  headX: 'Cinzel_900Black',
  body: 'AlegreyaSans_500Medium',
  bodyB: 'AlegreyaSans_800ExtraBold',
};

/** Gold-trimmed dark wood panel style used across the HUD. */
export const panel = {
  backgroundColor: C.wood,
  borderColor: C.goldDark,
  borderWidth: 1.5,
  borderRadius: 10,
} as const;
