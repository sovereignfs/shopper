/**
 * Sending mail (DESIGN.md §14.3), behind one small interface so that the app is tested against a mailer a test can read and runs against SMTP. **Mail
 * is optional:** with no `SHOPPER_SMTP_HOST` there is no mailer, an address is not verified and a forgotten password is not reset by mail, and no screen
 * or endpoint offers either. The text of a message is made by `templates.ts` and holds a link and nothing else of the account. In 0.1.0 this is only
 * what sign-in sends; the mail outbox for notices and invitations is task 9.1.
 */
export interface Message {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface Mailer {
  send(message: Message): Promise<void>;
}
