import { Barcode, QrCode } from '@sovereignfs/ui';
import { type CodeKind } from '../cards/kinds';
import { drawn } from '../cards/codes';
import styles from './CardScreen.module.css';

/**
 * **A card's code, drawn** (DESIGN.md §16.14): a QR code (the squares `uqr` makes, drawn by `QrCode`) or a barcode (`Barcode`), black on white with its quiet zone, as large as the screen lets it
 * be, since a scanner at a till reads contrast and size and not a theme. Nothing is requested to draw it. A value its kind cannot hold (a card from a build that knew another kind, or one that was
 * changed) draws nothing and says so, with the number still shown, so that a cashier can type it.
 */
export function CodeView({
  kind,
  code,
  label,
}: {
  kind: CodeKind;
  code: string;
  /** What the picture is, for a screen reader. */
  label: string;
}) {
  const shown = drawn(kind, code);
  if (!shown)
    return (
      <p className={styles.cannot}>This card’s code cannot be shown. Edit the card to fix it.</p>
    );
  return (
    <div className={styles.code}>
      {shown.kind === 'qr' ? (
        <QrCode modules={shown.modules} label={label} />
      ) : (
        <Barcode format={shown.format} value={shown.value} label={label} />
      )}
    </div>
  );
}
