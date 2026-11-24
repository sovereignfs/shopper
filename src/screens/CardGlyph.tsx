import { Icon } from '@sovereignfs/ui';
import { cardColorOf, cardIconOf } from '../cards/appearance';
import styles from './ListGlyph.module.css';

/**
 * A card's icon, drawn in its colour on the ordinary surface (RFC 0007), as a list's is (`ListGlyph`): **never a background and never the colour of text**, so that light and dark stay readable
 * whatever colour a person chose, and held to the icons and colours a card may have, so that a value this build does not know, or one that was changed, is the default and never reaches a style.
 */
export function CardGlyph({
  card,
  size = 'md',
}: {
  card: { icon?: string | null; color?: string | null };
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  return (
    <span className={styles.glyph} style={{ color: cardColorOf(card.color) }}>
      <Icon name={cardIconOf(card.icon)} size={size} aria-hidden />
    </span>
  );
}
