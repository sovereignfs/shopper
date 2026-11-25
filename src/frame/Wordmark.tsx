import Link from 'next/link';
import styles from './Wordmark.module.css';

/**
 * Shopper's wordmark, *shopper.*, as a link home: what the frame's header draws in place of core's badge (`Header`'s and `AppFrame`'s `brand`, RFC 0005). A screen
 * reader says the app's name, not the letters.
 */
export function Wordmark({ name }: { name: string }) {
  return (
    <Link href="/" className={styles.brand} aria-label={name}>
      <span className={styles.wordmark} aria-hidden>
        shopper.
      </span>
    </Link>
  );
}
