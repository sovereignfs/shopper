import { Icon } from '@sovereignfs/ui';
import { listColorOf, listIconOf } from '../lists/appearance';
import styles from './ListGlyph.module.css';

/**
 * A list's icon, drawn in its colour on the ordinary surface (RFC 0005): **never a background and never the colour of text**, so that light and dark stay
 * readable whatever colour a person chose. What is drawn is held to the lists in `src/lists/appearance.ts`, so a value this build does not know, or one that
 * was changed, is the default and never reaches a style. Decorative: the list's name is beside it.
 */
export function ListGlyph({
  list,
  size = 'md',
}: {
  list: { icon?: string | null; color?: string | null };
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  return (
    <span className={styles.glyph} style={{ color: listColorOf(list.color) }}>
      <Icon name={listIconOf(list.icon)} size={size} aria-hidden />
    </span>
  );
}
