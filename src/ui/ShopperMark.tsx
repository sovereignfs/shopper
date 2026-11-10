/**
 * Shopper's mark: a bag with a tick, in the colour of the text around it (`currentColor`), so that it follows the theme; the tick is cut out of the
 * bag in the page's surface colour. The view box is the shape's own bounds, so the mark is as wide as its height makes it and nothing pads it. It says
 * nothing to a screen reader unless it is given a `label`: beside the name, the name says it. The same shape is the app's icon (`public/icons/`).
 */
export function ShopperMark({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      className={className}
      viewBox="130 100 252 340"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      focusable="false"
    >
      <path d="M146 196h220l-17 206a24 24 0 0 1-24 22H187a24 24 0 0 1-24-22z" fill="currentColor" />
      <path
        d="M200 196v-30a56 56 0 0 1 112 0v30"
        fill="none"
        stroke="currentColor"
        strokeWidth="26"
        strokeLinecap="round"
      />
      <path
        d="M207 308l37 37 62-76"
        fill="none"
        strokeWidth="30"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ stroke: 'var(--sv-color-surface)' }}
      />
    </svg>
  );
}
