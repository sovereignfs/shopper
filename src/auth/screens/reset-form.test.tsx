import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ResetForm } from './ResetForm';

/**
 * A form a browser can send before the page runs is sent as a GET, with every named box in the address, and so in the history and a proxy's access log.
 * Sign-in and sign-up are tried in a browser with no script (`e2e/security.spec.ts`); the reset page is there only where mail is, which the browser
 * tests' instance has not, so its form is checked here as the server draws it.
 */
describe('the reset password form, as the server draws it', () => {
  const html = renderToStaticMarkup(
    createElement(ResetForm, { minLength: 10, vaultId: 'vault', email: 'ada@example.com' }),
  );

  it('cannot be sent: its button is off', () => {
    expect(html.match(/<input[^>]*type="password"/g)).toHaveLength(2);
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toContain('type="submit"');
    expect(buttons[0]).toContain('disabled=""');
  });

  it('sends nothing in the address when a script sends it: it goes by POST', () => {
    expect(html.match(/<form[^>]*>/g)).toEqual([expect.stringContaining('method="post"')]);
  });
});
