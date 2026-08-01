// Renders a resolved asset ({emoji,label,img}) as an <img> when art exists,
// else the emoji fallback. `className` styles both (img fills, emoji sizes).
import { iconAsset } from './assets.js';

export default function Art({ a, className = '', style }) {
  if (a && a.img) {
    return <img className={`art-img ${className}`} src={a.img} alt={a.label || ''} draggable={false} style={style} />;
  }
  return <span className={`art-emoji ${className}`} style={style}>{a ? a.emoji : '❓'}</span>;
}

// Icons section shorthand: <Icon id="close" /> === <Art a={resolve('icon.close')} />. Renders the
// generated icon art once exported, the emoji fallback until then. `id` is the icon.* suffix.
export function Icon({ id, className = '', style }) {
  return <Art a={iconAsset(id)} className={className} style={style} />;
}
