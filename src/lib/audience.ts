export const MIN_AUDIENCE = 10;
export const MAX_AUDIENCE = 300;
export const MAX_HATER_INTENSITY = 3;

export type Kind = "lover" | "hater" | "neutral";

export interface AudienceConfig {
  size: number;
  lovers: number;
  haters: number;
  /** 0 = calm … 3 = extreme hater behaviour */
  intensity: number;
  /** allow stylized stone-throwing at high intensity */
  stones: boolean;
}

export const INTENSITY_LABELS = ["Calm", "Mild", "High", "Extreme"];

export function validateConfig(c: AudienceConfig): { ok: boolean; error?: string; neutral: number } {
  const neutral = c.size - c.lovers - c.haters;
  if (!Number.isInteger(c.size) || c.size < MIN_AUDIENCE || c.size > MAX_AUDIENCE)
    return { ok: false, error: `Audience size must be between ${MIN_AUDIENCE} and ${MAX_AUDIENCE}.`, neutral: Math.max(0, neutral) };
  if (!Number.isInteger(c.lovers) || !Number.isInteger(c.haters) || c.lovers < 0 || c.haters < 0)
    return { ok: false, error: "Counts must be whole numbers of 0 or more.", neutral: Math.max(0, neutral) };
  if (neutral < 0)
    return { ok: false, error: `Lovers + Haters (${c.lovers + c.haters}) can't exceed the audience size (${c.size}).`, neutral: 0 };
  if (!Number.isInteger(c.intensity) || c.intensity < 0 || c.intensity > MAX_HATER_INTENSITY)
    return { ok: false, error: `Hater intensity must be between 0 and ${MAX_HATER_INTENSITY}.`, neutral: Math.max(0, neutral) };
  return { ok: true, neutral };
}

export const PHRASES = {
  lover: ["You've got this!", "Amazing!", "Woooo! 🎉", "Keep going!", "Love it! ❤️", "Bravo!", "So good!", "Encore!", "We believe in you!", "Star! ⭐"],
  hater: ["Hmm… really?", "Boring.", "I've seen better.", "Speak up!", "Get to the point", "Meh. 🙄", "Not convinced.", "Is this it?", "Booo! 👎", "My grandma does better", "Ha! Look at them", "Next!"],
  neutral: ["Interesting…", "What did they say?", "Hmm, okay.", "Nice point.", "Shh!", "Where's the exit?", "Not bad."],
};
