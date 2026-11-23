# Shopper

Shopping lists you share one by one, that work in the shop with no signal, and run on their own or on a [Sovereign](https://github.com/sovereignfs/sovereign)
instance.

- **Lists** you add to quickly, with suggestions that learn what you buy, and items shown by aisle.
- **Shopping mode** for the aisle: large rows, the screen kept on, ticked items dropping into the basket, and a _Finish shopping_ that clears what you bought.
- **Sharing** list by list, by a link: the people you invite see and change that list, and nothing else of yours.
- **Offline first:** everything works with no network and syncs in the background. It opens with no network too, once it has been opened once.
- **Private:** names, notes and the like are encrypted on your device, under keys of each list's own, before they reach the server
  ([what that does and does not do](#encryption)). Not yet audited.

It is a web app that installs like any other (a PWA), with its own database (an sqld service, a SQLite file or PostgreSQL), and people sign in with an email and a
password, through a Sovereign instance, or both. It needs no Sovereign instance: it runs fully on its own. **Changing in a coming release:** an instance
will sign people in one way only, through Sovereign when it is hosted and with its own accounts when it is alone; one set up with both will sign in
through Sovereign only, and say so when it starts.

## What it does, and does not do yet

**It does:** accounts (a password, or a Sovereign core); lists and items with quantities, units, categories, icons and notes; suggestions from what you buy and a
starter catalog; ticking off, _Bought_, _Clear bought_ and undo; shopping mode; sharing a list by a link, with leaving and removing, list by list; working with no
network, and syncing; encryption on your device; Web Push; a person's export from a Sovereign core; deleting your account.

**It does not do yet:** roles other than Admin and Member; trips, shops, prices and
totals; invitations by email, notices and the bell; live updates (a device asks every 20 seconds, every 10 in shopping mode, unless you set it); import;
a pantry, barcodes and photos. [`ROADMAP.md`](ROADMAP.md) has the order they come in. What needs a network, and what a person cannot hide from others on a list
they share, is in [`docs/working-offline.md`](docs/working-offline.md) and [`docs/sharing.md`](docs/sharing.md).

## Run it

One image, three database forms. They are the same app; only where it keeps its data differs. The image is `ghcr.io/sovereignfs/shopper` (a release's number is
its tag); to build it from this repository instead:

```bash
eval "docker build $(pnpm exec sovereign-manifest docker-args) -t shopper ."
```

It listens on port 3007, runs as `node` (not root), applies its own migrations when it starts, and answers `GET /api/health` with `200` once its database is
ready. It stops on SIGTERM within seconds. Put a reverse proxy with TLS in front of it and set `SHOPPER_URL` to the address people use. **The proxy must set `X-Forwarded-For` from the real connection and replace any the client sent** (Caddy does by default; nginx needs `proxy_set_header X-Forwarded-For $remote_addr;`): Shopper's limits on sign-in and on opening links count by that address, and a client that can choose it can choose to be counted as someone new every time.

### The smallest: one container, a SQLite file

```bash
docker run -d -p 127.0.0.1:3007:3007 -v shopper:/data \
  -e SHOPPER_DB_DIALECT=sqlite -e SHOPPER_SQLITE_URL=file:/data/shopper.db \
  -e SHOPPER_URL=https://shopper.example.com -e SHOPPER_AUTH_LOCAL=1 \
  -e SHOPPER_AUTH_SECRET="$(openssl rand -base64 48)" -e SHOPPER_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  shopper
```

**Keep the two generated values:** they are in no file. Make them once, put them in your own secrets, and give the same ones every time. The file must stay on
a local disk, never a network filesystem, and a second instance cannot share it.

### With Compose

[`deploy/`](deploy/) has the three setups, each for one form of database, with an `.env.example`:

```bash
cd deploy
cp .env.example .env     # then edit it: at least SHOPPER_URL, SHOPPER_AUTH_SECRET and SHOPPER_ENCRYPTION_KEY
docker compose up -d --build                                                   # an sqld service (the default)
docker compose -f compose.file.yaml up -d --build                              # a SQLite file
docker compose -f compose.yaml -f compose.postgres.yaml up -d --build          # PostgreSQL (Compose 2.24 or later)
```

[`deploy/README.md`](deploy/README.md) has the rest: your own PostgreSQL, backups, updating, and checking a setup with `scripts/deploy-check.sh`.

### Hosted by a Sovereign instance

`sv app add shopper` hosts it from `sovereign.manifest.json`, which is also the image's label. The instance gives it a database and its settings, and people sign in
through it. Set `SHOPPER_AUTH_LOCAL=1` as well and people who are not on the instance can make an account, which is what lets them accept a link you send (until a
coming release, from which a hosted Shopper signs in through the instance only, and someone you send a link to makes an account there). See
[`deploy/README.md`](deploy/README.md).

## Settings

Every setting Shopper reads is here, in [`.env.example`](.env.example) and nowhere else (a test holds the three together). A secret may be given as `NAME_FILE=/path`
instead of `NAME=value`, so that it is never in the process list. The server stops at start-up, naming the setting that is wrong and never its value.

| Setting                                                                                                     | What                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHOPPER_URL`                                                                                               | The address people use: https, except on localhost, with no path. Emailed links, cookies and the Sovereign redirect are made from it. Required with either way of signing in                  |
| `SHOPPER_AUTH_LOCAL`                                                                                        | `1`: sign in with an email and a password. Off means off: the sign-in and sign-up pages answer 404                                                                                            |
| `SHOPPER_AUTH_SECRET`                                                                                       | 32 characters or more, to sign sessions and tokens (`openssl rand -base64 48`). Changing it signs everyone out                                                                                |
| `SHOPPER_AUTH_SIGNUP`                                                                                       | `open` (the default) or `closed`: see below                                                                                                                                                   |
| `SHOPPER_AUTH_PASSWORD_MIN_LENGTH`                                                                          | The shortest password, 8 to 128. Default 10                                                                                                                                                   |
| `SHOPPER_CORE_URL`, `SHOPPER_CORE_CLIENT_ID`, `SHOPPER_CORE_CLIENT_SECRET`                                  | Sign-in through a Sovereign core: all three or none. Register the client at core with the redirect `<SHOPPER_URL>/api/auth/callback/sovereign`. Either way, or both, can be on                |
| `SHOPPER_DB_DIALECT`                                                                                        | `sqld` (the default), `sqlite` or `postgres`. Nothing guesses it from an address                                                                                                              |
| `SHOPPER_SQLD_URL`, `SHOPPER_SQLD_ADMIN_URL`                                                                | An sqld service (default `http://sqld:8080`) and its admin address, which makes the namespaces (default `http://sqld:8081`)                                                                   |
| `SHOPPER_SQLITE_URL`                                                                                        | `file:/path/shopper.db`: a database file, for one container. Required with `sqlite`. The sign-in database, `shopper_auth.db`, is beside it                                                    |
| `SHOPPER_POSTGRES_URL`, `SHOPPER_POSTGRES_POOL_MAX`                                                         | PostgreSQL's address (required with `postgres`; a secret, so it may be `_FILE`) and the most connections the app holds, 2 or more. Default 10                                                 |
| `SHOPPER_DB_CONNECT_TIMEOUT_MS`                                                                             | How long to wait for a database that is still starting. Default 30000                                                                                                                         |
| `SHOPPER_MIGRATIONS_DIR`                                                                                    | Where the migrations are, if not beside the server                                                                                                                                            |
| `SHOPPER_ENCRYPTION_KEY`                                                                                    | Required. Seals what the server holds itself: see below (`openssl rand -base64 32`)                                                                                                           |
| `SHOPPER_ENCRYPTION_KEY_PREVIOUS`                                                                           | While moving to a new key: the old one, until the move is done                                                                                                                                |
| `SHOPPER_SMTP_HOST`, `SHOPPER_SMTP_PORT`, `SHOPPER_SMTP_FROM`, `SHOPPER_SMTP_USER`, `SHOPPER_SMTP_PASSWORD` | Mail, optional: address verification and password reset. No host, no mail, and neither exists. Port 587 by default; 465 is SMTPS                                                              |
| `SHOPPER_SYNC_INTERVAL_SECONDS`                                                                             | How often a visible device asks for what others changed, 5 to 600. Default 20; shopping mode asks every 10 seconds, or this if it is shorter                                                  |
| `SHOPPER_WORKER`                                                                                            | Background jobs run in the web process; when several processes share one database, set `off` on all but one                                                                                   |
| `SHOPPER_LIMIT_HOUSEHOLD_MEMBERS`                                                                           | People on a list. Default 20                                                                                                                                                                  |
| `SHOPPER_LIMIT_ACCOUNT_HOUSEHOLDS`                                                                          | Groups an account has lists from, its own included. Default 20                                                                                                                                |
| `SHOPPER_LIMIT_HOUSEHOLD_LISTS`                                                                             | Lists a person makes, archived included. Default 100                                                                                                                                          |
| `SHOPPER_LIMIT_LIST_OPEN_ITEMS`                                                                             | Open items on a list. Default 500                                                                                                                                                             |
| `SHOPPER_LIMIT_HOUSEHOLD_PRODUCTS`                                                                          | Products in a group's lists' catalogs, together. Default 5000                                                                                                                                 |
| `SHOPPER_VAPID_PRIVATE_KEY`                                                                                 | Web Push, optional: notifications on a device where Shopper is not open. No key, no push. 32 bytes, URL-safe base64 (`npx @sovereignfs/push keys`); a hosted Shopper has the instance make it |
| `SHOPPER_VAPID_SUBJECT`                                                                                     | Whom the push services can tell when something is wrong, `mailto:` or `https:`. Defaults to `SHOPPER_URL` when that is https                                                                  |

At least one way of signing in must be on, or there is no sign-in at all. The image's own `PORT` (3007) comes from the manifest and is not one of these.

### What `SHOPPER_AUTH_SIGNUP=open` means, and when to set `closed`

**`open`**, the default in 0.1.0, lets anyone who can reach the page make an account. That is what lets someone you invite, who has no account, follow your link,
make one and join. It also means a stranger who finds your address can make an account of their own: they get lists of their own and see none of yours, but
they use your server. **If your address is public, set `closed` once everyone who is to share has joined.** **`closed`** takes the first account and then refuses
every other sign-up, at the server and not only on the page; a person invited after that must already have an account to accept a link. A sign-in through a
Sovereign core is **never** refused by it: the core has decided who the person is, so an account made through it is made whatever this says.

### Encryption

**What people write into Shopper is encrypted on their device, with keys of each list's own, held only by the people on it** (the suite's
encryption, through `@sovereignfs/sdk`; **not yet audited**). The server stores and syncs what it cannot read, and someone you share one list with
cannot open your others. Lists shared before your lists moved to encryption stay sealed by the server's own key, and Settings says which is which.
People's names and emails, and any list not yet encrypted, are sealed at rest under `SHOPPER_ENCRYPTION_KEY`: keep it with your secrets, apart from the
database backups. A lost key means what it seals cannot be read. A person signing in with a password is shown a recovery kit once: with neither the password nor the kit, their
lists are gone for good. It does not protect against whoever runs the server, which sends the app the browser runs.

More in [`docs/encryption.md`](docs/encryption.md).

## Develop

You need Node 24.15 or newer and [pnpm](https://pnpm.io).

```bash
pnpm install --frozen-lockfile
cp .env.example .env
```

Then in `.env`, set `SHOPPER_AUTH_SECRET` (`openssl rand -base64 48`) and `SHOPPER_ENCRYPTION_KEY` (`openssl rand -base64 32`). Also set a database you
have: `SHOPPER_DB_DIALECT=sqlite` and `SHOPPER_SQLITE_URL=file:./data/shopper.db` need nothing running (the default, `sqld`, is the one in
`deploy/`). Then:

```bash
pnpm dev
```

The app is on <http://localhost:3007>. `pnpm seed` makes three accounts with a shared list to look at (local databases only). [`CONTRIBUTING.md`](CONTRIBUTING.md)
says how a change is made, [`AGENTS.md`](AGENTS.md) holds the rules of the app and the commands, [`DESIGN.md`](DESIGN.md) is the design and
[`ROADMAP.md`](ROADMAP.md) the order of work. [`RELEASING.md`](RELEASING.md) says how a release is made.

## Licence

[AGPL-3.0-or-later](LICENSE), since it bundles `@sovereignfs/ui`.
