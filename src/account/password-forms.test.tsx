import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PasswordSection } from './PasswordSection';

/**
 * A form a browser can send before the page runs is sent as a GET, with every **named** box in the address, and so in the history and a proxy's access log.
 * Change password is the one form of Shopper's own that the server draws (the others appear only when a person asks for them): its button is off until the
 * page runs, and its boxes have no name.
 */
describe('the change password form, as the server draws it', () => {
  const html = renderToStaticMarkup(
    createElement(PasswordSection, {
      hasPassword: true,
      minLength: 10,
      email: 'ada@example.com',
      vaultId: 'vault',
    }),
  );

  it('cannot be sent: its button is off', () => {
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toContain('type="submit"');
    expect(buttons[0]).toContain('disabled=""');
  });

  it('would put nothing in the address: no box has a name', () => {
    const boxes = html.match(/<input[^>]*>/g) ?? [];
    expect(boxes).toHaveLength(3);
    for (const box of boxes) expect(box).not.toMatch(/\sname=/);
  });
});
