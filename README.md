# Shopper

A household's shopping lists that work in the shop with no signal, and run on their own or on a [Sovereign](https://github.com/sovereignfs/sovereign)
instance.

- **Lists** you add to quickly, with suggestions that learn what your household buys, and items shown by aisle.
- **Shopping mode** for the aisle: large rows, the screen kept on, ticked items dropping into the basket, and a _Finish shopping_ that clears what you bought.
- **Sharing** by a link: the people you invite see and edit every list of your household.
- **Offline first:** everything works with no network and syncs in the background. It opens with no network too, once it has been opened once.
- **Private at rest:** names, notes and the like are encrypted in the database under the app's own key ([what that does and does not do](#what-encryption-at-rest-does)).

It is a web app that installs like any other (a PWA), with its own database (an sqld service, a SQLite file or PostgreSQL), and people sign in with an email and a
password, through a Sovereign instance, or both. It needs no Sovereign instance: it runs fully on its own.

## What 0.1.0 does, and does not do yet

**It does:** accounts (a password, or a Sovereign core); lists and items with quantities, units, categories, icons and notes; suggestions from what the household
buys and a starter catalog; ticking off, _Bought_, _Clear bought_ and undo; shopping mode; sharing a household by a link, with leaving and removing; working with no
network, and syncing; encrypted storage; deleting your account.

**It does not do yet:** several households and naming them, roles other than Admin and Member, and moving a list between households; trips, shops, prices and
totals; invitations by email, notices and the bell; live updates (a device asks every 20 seconds, every 10 in shopping mode, unless you set it); export and import;
a pantry, barcodes and photos. [`ROADMAP.md`](ROADMAP.md) has the order they come in. What needs a network, and what a person cannot hide from others in their
household, is in [`docs/working-offline.md`](docs/working-offline.md) and [`docs/sharing.md`](docs/sharing.md).

## Run it

One image, three database forms. They are the same app; only where it keeps its data differs. The image is `ghcr.io/sovereignfs/shopper` (a release's number is
its tag); to build it from this repository instead:

```bash
eval "docker build $(pnpm exec sovereign-manifest docker-args) -t shopper ."
```

It listens on port 3007, runs as `node` (not root), applies its own migrations when it starts, and answers `GET /api/health` with `200` once its database is
ready. It stops on SIGTERM within seconds. Put a reverse proxy with TLS in front of it and set `SHOPPER_URL` to the address people use.

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
through it. Set `SHOPPER_AUTH_LOCAL=1` as well and people who are not on the instance can make an account, which is what lets them accept a link you send. See
[`deploy/README.md`](deploy/README.md).

## Settings

Every setting Shopper reads is here, in [`.env.example`](.env.example) and nowhere else (a test holds the three together). A secret may be given as `NAME_FILE=/path`
instead of `NAME=value`, so that it is never in the process list. The server stops at start-up, naming the setting that is wrong and never its value.

| Setting                                                                                                     | What                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SHOPPER_URL`                                                                                               | The address people use: https, except on localhost, with no path. Emailed links, cookies and the Sovereign redirect are made from it. Required with either way of signing in   |
| `SHOPPER_AUTH_LOCAL`                                                                                        | `1`: sign in with an email and a password. Off means off: the sign-in and sign-up pages answer 404                                                                             |
| `SHOPPER_AUTH_SECRET`                                                                                       | 32 characters or more, to sign sessions and tokens (`openssl rand -base64 48`). Changing it signs everyone out                                                                 |
| `SHOPPER_AUTH_SIGNUP`                                                                                       | `open` (the default) or `closed`: see below                                                                                                                                    |
| `SHOPPER_AUTH_PASSWORD_MIN_LENGTH`                                                                          | The shortest password, 8 to 128. Default 10                                                                                                                                    |
| `SHOPPER_CORE_URL`, `SHOPPER_CORE_CLIENT_ID`, `SHOPPER_CORE_CLIENT_SECRET`                                  | Sign-in through a Sovereign core: all three or none. Register the client at core with the redirect `<SHOPPER_URL>/api/auth/callback/sovereign`. Either way, or both, can be on |
| `SHOPPER_DB_DIALECT`                                                                                        | `sqld` (the default), `sqlite` or `postgres`. Nothing guesses it from an address                                                                                               |
| `SHOPPER_SQLD_URL`, `SHOPPER_SQLD_ADMIN_URL`                                                                | An sqld service (default `http://sqld:8080`) and its admin address, which makes the namespaces (default `http://sqld:8081`)                                                    |
| `SHOPPER_SQLITE_URL`                                                                                        | `file:/path/shopper.db`: a database file, for one container. Required with `sqlite`. The sign-in database, `shopper_auth.db`, is beside it                                     |
| `SHOPPER_POSTGRES_URL`, `SHOPPER_POSTGRES_POOL_MAX`                                                         | PostgreSQL's address (required with `postgres`; a secret, so it may be `_FILE`) and the most connections the app holds, 2 or more. Default 10                                  |
| `SHOPPER_DB_CONNECT_TIMEOUT_MS`                                                                             | How long to wait for a database that is still starting. Default 30000                                                                                                          |
| `SHOPPER_MIGRATIONS_DIR`                                                                                    | Where the migrations are, if not beside the server                                                                                                                             |
| `SHOPPER_ENCRYPTION_KEY`                                                                                    | Required. Seals what a household buys: see below (`openssl rand -base64 32`)                                                                                                   |
| `SHOPPER_ENCRYPTION_KEY_PREVIOUS`                                                                           | While moving to a new key: the old one, until the move is done                                                                                                                 |
| `SHOPPER_SMTP_HOST`, `SHOPPER_SMTP_PORT`, `SHOPPER_SMTP_FROM`, `SHOPPER_SMTP_USER`, `SHOPPER_SMTP_PASSWORD` | Mail, optional: address verification and password reset. No host, no mail, and neither exists. Port 587 by default; 465 is SMTPS                                               |
| `SHOPPER_SYNC_INTERVAL_SECONDS`                                                                             | How often a visible device asks for what others changed, 5 to 600. Default 20; shopping mode asks every 10 seconds, or this if it is shorter                                   |
| `SHOPPER_WORKER`                                                                                            | Background jobs run in the web process; when several processes share one database, set `off` on all but one                                                                    |
| `SHOPPER_LIMIT_HOUSEHOLD_MEMBERS`                                                                           | Members of a household. Default 20                                                                                                                                             |
| `SHOPPER_LIMIT_ACCOUNT_HOUSEHOLDS`                                                                          | Households an account is in, its own included. Default 20                                                                                                                      |
| `SHOPPER_LIMIT_HOUSEHOLD_LISTS`                                                                             | Lists of a household, archived included. Default 100                                                                                                                           |
| `SHOPPER_LIMIT_LIST_OPEN_ITEMS`                                                                             | Open items on a list. Default 500                                                                                                                                              |
| `SHOPPER_LIMIT_HOUSEHOLD_PRODUCTS`                                                                          | Products in a household's catalog. Default 5000                                                                                                                                |

At least one way of signing in must be on, or there is no sign-in at all. The image's own `PORT` (3007) comes from the manifest and is not one of these.

### What `SHOPPER_AUTH_SIGNUP=open` means, and when to set `closed`

**`open`**, the default in 0.1.0, lets anyone who can reach the page make an account. That is what lets someone you invite, who has no account, follow your link,
make one and join. It also means a stranger who finds your address can make an account of their own: they get a household of their own and see none of yours, but
they use your server. **If your address is public, set `closed` once everyone who is to share has joined.** **`closed`** takes the first account and then refuses
every other sign-up, at the server and not only on the page; a person invited after that must already have an account to accept a link. A sign-in through a
Sovereign core is **never** refused by it: the core has decided who the person is, so an account made through it is made whatever this says.

### What encryption at rest does

Everything that says **what a household buys, where and who they are** is sealed in the database under `SHOPPER_ENCRYPTION_KEY`: the names of households, lists,
items, products and categories, notes, and people's names and addresses. Each row has a data key of its own, wrapped under the instance key and bound to the row, so a
value moved to another row will not open. Quantities, units, times, positions and the structure that sorting and merging need stay readable, and alone say little.

- **It protects** against a copied database, a backup, a stolen disk, and someone reading the tables.
- **It does not protect** against whoever controls the running server: the server has the key and reads everything to do its work. Nor the device: a signed-in
  browser holds the household's lists in plain text until the person signs out.
- **A lost key means the sealed content cannot be read, and nothing can recover it.** Keep it with your secrets, apart from the database backups.
- **To change it**, put the new key in `SHOPPER_ENCRYPTION_KEY` and the old one in `SHOPPER_ENCRYPTION_KEY_PREVIOUS`, start the server once (it moves what is stored to
  the new key), and then remove the old one.

More in [`docs/encryption.md`](docs/encryption.md).

## Develop

You need Node 24.15 or newer and [pnpm](https://pnpm.io).

```bash
pnpm install --frozen-lockfile
pnpm dev
```

The app is on <http://localhost:3007>. `pnpm seed` makes three accounts with a shared household to look at (local databases only). [`CONTRIBUTING.md`](CONTRIBUTING.md)
says how a change is made, [`AGENTS.md`](AGENTS.md) holds the rules of the app and the commands, [`DESIGN.md`](DESIGN.md) is the design and
[`ROADMAP.md`](ROADMAP.md) the order of work. [`RELEASING.md`](RELEASING.md) says how a release is made.

## Licence

[AGPL-3.0-or-later](LICENSE), since it bundles `@sovereignfs/ui`.
