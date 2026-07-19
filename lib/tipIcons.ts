// The AI prefixes home-remedy tips with emoji from a fixed set (☕ 🥛 🥚 🍌
// 🧴 🌿 💧 🌞 🪴). Emoji render unreliably on iOS (tofu "?" boxes — see the
// project's Ionicons-only rule), so we strip the prefix and map it to an
// Ionicons glyph rendered in a tinted circle instead.

const EMOJI_TO_ICON: [string, string][] = [
  ['☕', 'cafe'],
  ['🥛', 'pint'],
  ['🥚', 'egg'],
  ['🍌', 'nutrition'],
  ['🧴', 'flask'],
  ['🌿', 'leaf'],
  ['💧', 'water'],
  ['🌞', 'sunny'],
  ['🪴', 'flower'],
];

export type ParsedTip = { icon: string; text: string };

export function parseTip(tip: string, fallbackIcon = 'sparkles'): ParsedTip {
  const trimmed = tip.trim();
  for (const [emoji, icon] of EMOJI_TO_ICON) {
    if (trimmed.startsWith(emoji)) {
      return { icon, text: trimmed.slice(emoji.length).replace(/^️?\s*/, '') };
    }
  }
  // Unknown leading emoji (model drift) — strip it anyway so it can't tofu.
  const stripped = trimmed.replace(/^\p{Extended_Pictographic}️?\s*/u, '');
  return { icon: fallbackIcon, text: stripped };
}
