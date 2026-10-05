import type { CSSProperties } from 'react';

const atlases: Record<string, readonly string[]> = {
  garden: ['plant', 'flower', 'mushroom', 'bonsai', 'tea', 'pastry', 'tiny-house', 'key'],
  magic: ['wand', 'potion', 'cloak', 'spellbook', 'crystal', 'rune', 'egg', 'dragon'],
  voyager: ['shell', 'coral', 'boat', 'pearl', 'lantern', 'telescope', 'moon', 'star'],
  keepsakes: ['vinyl', 'headphones', 'letter', 'camera', 'snowglobe', 'fox', 'dog', 'cat'],
};
const atlasImages: Record<string, string> = {
  garden: '/images/reward-garden.webp',
  magic: '/images/reward-magic.webp',
  voyager: '/images/reward-voyager.webp',
  keepsakes: '/images/reward-keepsakes.webp',
};
export const rewardArt = Object.fromEntries(Object.entries(atlases).flatMap(([atlas, names]) => names.map((name, index) => [name, { image: atlasImages[atlas], index }])));
export function RewardDrawing({ art, size = 80, alt = '', className = '' }: { art: string; size?: number; alt?: string; className?: string }) {
  const item = rewardArt[art];
  if (!item) return <span className={`reward-drawing reward-art-unavailable ${className}`} aria-label={alt || 'Artwork unavailable'} style={{ width: size, height: size }} />;
  const style: CSSProperties = { display: 'inline-block', width: size, height: size, flexShrink: 0, backgroundImage: `url("${item.image}")`, backgroundSize: '400% 200%', backgroundRepeat: 'no-repeat', backgroundPosition: `${item.index % 4 * 100 / 3}% ${Math.floor(item.index / 4) * 100}%` };
  return <span className={`reward-drawing ${className}`} style={style} role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true} />;
}
export default RewardDrawing;
