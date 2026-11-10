/**
 * What the landing page says (DESIGN.md §16.4), as typed content so that it is read in one place and cannot be half-edited. It says what is so
 * today and nothing that is only planned: a page that promises what the app does not do is worse than a short one. Written for 0.1.0, and each task
 * that adds something a visitor would want to know adds a line here, in the change that makes it so.
 */
export interface Feature {
  title: string;
  body: string;
}

export const landing = {
  heading: 'Shopping lists that work in the shop',
  lead: 'Add what you need, tick it off as you shop, and share the list with the people you shop with. It works with no signal, and you run it yourself or your Sovereign instance runs it for you.',
  features: [
    {
      title: 'It never makes you wait',
      body: 'Shopper works from what is on your phone, online or not. Adding and ticking show at once, and it syncs in the background.',
    },
    {
      title: 'Shared with a link',
      body: 'Send a link, and the person who opens it sees and edits your lists. Changes from both of you end up on both phones, with nothing lost.',
    },
    {
      title: 'Private on the server',
      body: 'What is on your lists is encrypted in the database, and nothing is loaded from another site.',
    },
  ] satisfies Feature[],
  signIn: 'Sign in',
  signUp: 'Create an account',
  noSignIn: 'Signing in is not set up on this server.',
} as const;
