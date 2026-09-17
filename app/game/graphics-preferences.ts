export const VISUAL_PREFERENCES_KEY = 'ashen-visual-preferences-v1';
export type GraphicsPreferences = { version: 1; brightness: number; impactShake: boolean };
export const DEFAULT_GRAPHICS: Readonly<GraphicsPreferences> = { version: 1, brightness: 1, impactShake: false };

export function validateGraphics(value: unknown): GraphicsPreferences {
  const input = value && typeof value === 'object' ? value as Partial<GraphicsPreferences> : {};
  if (input.version !== 1) return { ...DEFAULT_GRAPHICS };
  return {
    version: 1,
    brightness: typeof input.brightness === 'number' && Number.isFinite(input.brightness)
      ? Math.min(1.3, Math.max(.85, input.brightness)) : 1,
    impactShake: input.impactShake === true,
  };
}

export function readGraphics(read: (key: string) => string | null): GraphicsPreferences {
  try { return validateGraphics(JSON.parse(read(VISUAL_PREFERENCES_KEY) ?? 'null')); }
  catch { return { ...DEFAULT_GRAPHICS }; }
}

export function writeGraphics(value: GraphicsPreferences, write: (key: string, value: string) => void) {
  try { write(VISUAL_PREFERENCES_KEY, JSON.stringify(validateGraphics(value))); return true; }
  catch { return false; }
}

export function effectiveGraphics(value: GraphicsPreferences, reducedMotion: boolean): GraphicsPreferences {
  const valid = validateGraphics(value);
  return { ...valid, impactShake: valid.impactShake && !reducedMotion };
}
