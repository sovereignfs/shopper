# Running Shopper

Shopper is one image that runs on its own or hosted by a Sovereign instance. This folder is the first way: three setups, one for each form of
database. They are the same app; only where it keeps its data differs (`DESIGN.md` §22).

| Setup                  | Files                                    | The database                                         | For                                                                                                                                                             |
| ---------------------- | ---------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **sqld** (the default) | `compose.yaml`                           | An sqld service (libSQL's server), on its own volume | Most installs. The app holds no state, and operating it is the same as operating Sovereign                                                                      |
| **A file**             | `compose.file.yaml`                      | One SQLite file on a volume                          | The smallest: one container, one person or a small group. A second instance cannot share the file, and it must stay on a local disk, never a network filesystem |
| **PostgreSQL**         | `compose.yaml` + `compose.postgres.yaml` | PostgreSQL, or one you already run                   | An operator who prefers it, or has one                                                                                                                          |

## Start

```bash
cd deploy
cp .env.example .env     # then edit it: at least SHOPPER_URL, SHOPPER_AUTH_SECRET and SHOPPER_ENCRYPTION_KEY
docker compose up -d --build                                                   # sqld
docker compose -f compose.file.yaml up -d --build                              # a file
docker compose -f compose.yaml -f compose.postgres.yaml up -d --build          # PostgreSQL (Compose 2.24 or later)
```

Only the machine itself can reach the port (`127.0.0.1:3007`): put a reverse proxy with TLS in front of it, and set `SHOPPER_URL` to the address people use.
Emailed links, cookies and the sign-in redirect are made from it, and the server refuses to start on an address that is not https (localhost aside).

The smallest setup of all is one `docker run`, with no Compose:

```bash
docker run -d -p 127.0.0.1:3007:3007 -v shopper:/data \
  -e SHOPPER_DB_DIALECT=sqlite -e SHOPPER_SQLITE_URL=file:/data/shopper.db \
  -e SHOPPER_URL=https://shopper.example.com -e SHOPPER_AUTH_LOCAL=1 \
  -e SHOPPER_AUTH_SECRET="$(openssl rand -base64 48)" -e SHOPPER_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  ghcr.io/sovereignfs/shopper
```

(Keep the two generated values: they are in no file, so make them once and put them in your own secrets.)

## What the server does when it starts

It checks its settings and stops, naming the one that is wrong and never its value. It then makes the places its database lives in (an sqld
namespace, a directory, a PostgreSQL schema), waits for a database that is still starting (up to `SHOPPER_DB_CONNECT_TIMEOUT_MS`, 30 seconds), applies
its own migrations, and starts. It does not start if it cannot, and `GET /api/health` answers 200 only when the database does. Migrations apply once
each, and a second process starting at the same time is safe.

It stops on SIGTERM within seconds and exits 143.

## Your own PostgreSQL

Skip `compose.postgres.yaml` and set, in `.env`:

```
SHOPPER_DB_DIALECT=postgres
SHOPPER_POSTGRES_URL=postgres://user:password@host:5432/shopper
```

(or `SHOPPER_POSTGRES_URL_FILE`, a file holding it). The app makes its own schemas, `shopper` and `shopper_auth`, in that database.

## On a Sovereign instance

`sv app add` hosts Shopper from `sovereign.manifest.json`, which is also the image's label: the instance builds nothing of its own, gives the app a database, and
tells it where it is. What it sets is the settings above under Shopper's own names: `SHOPPER_URL`, `SHOPPER_CORE_URL`, `SHOPPER_CORE_CLIENT_ID` and
`SHOPPER_CORE_CLIENT_SECRET` (or `_FILE`), the database (`SHOPPER_DB_DIALECT` and its address) and `PORT`, and it makes `SHOPPER_AUTH_SECRET` and `SHOPPER_ENCRYPTION_KEY`
once and keeps them. With `SHOPPER_AUTH_LOCAL` unset, people sign in through the instance only: there is no password, sign-up or reset to find. Anyone the instance
signs in gets an account, whatever `SHOPPER_AUTH_SIGNUP` says (it is about local accounts). Mail (`SHOPPER_SMTP_*`) is not used when there is no password. The instance can
end a person's sessions here, and delete their account, by signed notices to `/api/sovereign/backchannel-logout` and `/api/sovereign/account-deleted`; both are
answered only when they carry a token the instance signed.

## Keys

There are two keys, and they are different things.

- **`SHOPPER_AUTH_SECRET`** signs sessions and tokens. Changing it signs everyone out. Make it once (`openssl rand -base64 48`) and keep it with your secrets.
- **`SHOPPER_ENCRYPTION_KEY`** seals, in the database, everything that says what a household buys, where and who they are: the names of households, lists, items,
  products and categories, notes, and people's names and addresses. Nothing of that is stored in plain text, so a copy of the database, a stolen disk or a backup of the
  volume holds none of it. **It does not hide anything from you:** the server has the key, so whoever runs it can read it. Make it once (`openssl rand -base64 32`) and
  keep it with your secrets, **apart from the database backups**. **A lost key means the sealed content cannot be read, and nothing can recover it.** To change it,
  put the new one in `SHOPPER_ENCRYPTION_KEY` and the old in `SHOPPER_ENCRYPTION_KEY_PREVIOUS`, start the server once (it moves what is stored to the new key), and then
  remove the old one.

## Backups

The database is the whole of it, apart from `SHOPPER_ENCRYPTION_KEY`, which is what makes it readable.

- **sqld:** a snapshot of the `sqld-data` volume, taken with sqld stopped or by your usual volume backup.
- **A file:** a snapshot of the volume. For a running copy, `sqlite3 /data/shopper.db ".backup /backup/shopper.db"`, or continuous replication such as Litestream. The
  auth database, `shopper_auth.db`, is beside it and is part of it.
- **PostgreSQL:** `pg_dump`, or your usual process.

A backup of the database without `SHOPPER_ENCRYPTION_KEY` cannot be read, and the key without the backup is of no use: keep them in different places, and test a
restore with both.

## Updating

Pull or build the new image and `docker compose up -d`. Migrations apply when the new server starts. A patch release has none and changes no setting; a
minor may, and going back is restoring the backup you took before it.

## Checking a setup

`scripts/deploy-check.sh` brings each setup up from nothing, checks the database it is on, restarts it, and stops it with SIGTERM, and CI runs it. Its last setup, `sovereign`, is an instance hosting the app (secrets as files, a PostgreSQL of its own, a port that is not the image's): it checks that the image's label is the manifest, that sign-in offers Sovereign and no password, that the icon and the addresses of core's notices answer, and that it stops on SIGTERM:

```bash
eval "docker build $(pnpm exec sovereign-manifest docker-args) -t shopper:ci ."
SHOPPER_IMAGE=shopper:ci scripts/deploy-check.sh
```
