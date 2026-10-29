const AUDIO_KEY = "bowa.preferredAudioLang";
const SUB_KEY = "bowa.preferredSubtitleLang";

export function getPreferredAudioLang(): string {
  if (typeof window === "undefined") return "ENG";
  return window.localStorage.getItem(AUDIO_KEY) || "ENG";
}

export function setPreferredAudioLang(lang: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUDIO_KEY, lang);
}

export function getPreferredSubtitleLang(): string {
  if (typeof window === "undefined") return "eng";
  return window.localStorage.getItem(SUB_KEY) || "eng";
}

export function setPreferredSubtitleLang(lang: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SUB_KEY, lang);
}

/** Loose match torrentio language tags / flags against a preference like ENG. */
export function streamMatchesAudioPref(streamLang: string, pref: string): boolean {
  if (!pref || pref === "any") return true;
  if (!streamLang) return pref === "any";
  const p = pref.toLowerCase();
  const s = streamLang.toLowerCase();
  if (s.includes(p)) return true;
  const aliases: Record<string, string[]> = {
    eng: ["eng", "en", "🇬🇧", "🇺🇸", "english"],
    spa: ["spa", "es", "🇪🇸", "spanish"],
    fre: ["fre", "fr", "🇫🇷", "french"],
    ger: ["ger", "de", "🇩🇪", "german"],
    ita: ["ita", "it", "🇮🇹", "italian"],
    por: ["por", "pt", "🇧🇷", "🇵🇹", "portuguese"],
    rus: ["rus", "ru", "🇷🇺", "russian"],
    jpn: ["jpn", "ja", "🇯🇵", "japanese"],
    kor: ["kor", "ko", "🇰🇷", "korean"],
    multi: ["multi", "dual"],
  };
  const keys = aliases[p] ?? [p];
  return keys.some((k) => s.includes(k));
}
