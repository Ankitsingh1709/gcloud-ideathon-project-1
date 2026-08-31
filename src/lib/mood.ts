/**
 * Colour is this app's one expressive channel. The interface itself is warm
 * neutral, so the only saturated colour on screen is the colour of how the
 * writer felt.
 *
 * Gemini returns free-form mood words ("Overwhelmed", "Quietly hopeful"), so
 * tones are matched by keyword rather than an exact switch. The previous exact
 * switch recognised seven literals and rendered everything else grey — which
 * was most of them, and quietly disabled the entire colour system.
 *
 * Orange is deliberately absent: that hue belongs to the ember accent, and
 * mood must never be mistaken for an interactive affordance.
 */
export interface MoodTone {
  /** Chip background, text and border. */
  chip: string;
  /** Solid colour for dots, chart fills and accents. */
  dot: string;
  /** Raw hex, for canvas/SVG contexts that cannot take a class. */
  hex: string;
}

const NEUTRAL: MoodTone = {
  chip: 'bg-ink-850 text-paper-400 border-ink-700',
  dot: 'bg-paper-600',
  hex: '#8c8378',
};

const TONES: Array<{ keywords: string[]; tone: MoodTone }> = [
  {
    keywords: ['joy', 'happy', 'elated', 'excited', 'delight', 'cheer', 'playful', 'proud'],
    tone: { chip: 'bg-amber-950/40 text-amber-300 border-amber-900/40', dot: 'bg-amber-400', hex: '#fbbf24' },
  },
  {
    keywords: ['grateful', 'thankful', 'appreciat', 'blessed', 'content', 'fulfilled'],
    tone: { chip: 'bg-emerald-950/40 text-emerald-300 border-emerald-900/40', dot: 'bg-emerald-400', hex: '#34d399' },
  },
  {
    keywords: ['calm', 'serene', 'peace', 'relaxed', 'still', 'settled', 'rested'],
    tone: { chip: 'bg-teal-950/40 text-teal-300 border-teal-900/40', dot: 'bg-teal-400', hex: '#2dd4bf' },
  },
  {
    keywords: ['reflect', 'thoughtful', 'pensive', 'contemplat', 'curious', 'wonder'],
    tone: { chip: 'bg-sky-950/40 text-sky-300 border-sky-900/40', dot: 'bg-sky-400', hex: '#38bdf8' },
  },
  {
    keywords: ['motivat', 'determin', 'focus', 'driven', 'hopeful', 'ready', 'energ'],
    tone: { chip: 'bg-lime-950/40 text-lime-300 border-lime-900/40', dot: 'bg-lime-400', hex: '#a3e635' },
  },
  {
    keywords: ['melanchol', 'sad', 'lonely', 'grief', 'down', 'tired', 'drained', 'numb', 'weary'],
    tone: { chip: 'bg-violet-950/40 text-violet-300 border-violet-900/40', dot: 'bg-violet-400', hex: '#a78bfa' },
  },
  {
    keywords: ['anxious', 'stress', 'overwhelm', 'worried', 'tense', 'afraid', 'fear', 'angry', 'frustrat', 'irritat'],
    tone: { chip: 'bg-rose-950/40 text-rose-300 border-rose-900/40', dot: 'bg-rose-400', hex: '#fb7185' },
  },
];

export function getMoodTone(mood: string): MoodTone {
  const normalized = (mood || '').toLowerCase();
  if (!normalized) return NEUTRAL;
  for (const { keywords, tone } of TONES) {
    if (keywords.some(keyword => normalized.includes(keyword))) return tone;
  }
  return NEUTRAL;
}

/** Class string for a mood chip. Signature matches the previous helper. */
export function getMoodColor(mood: string): string {
  return getMoodTone(mood).chip;
}
