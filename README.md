# Shopper

A household's shopping lists that work in the shop with no signal, and run on their own or on a [Sovereign](https://github.com/sovereignfs/sovereign)
instance.

- **Lists** you add to quickly, with suggestions that learn what your household buys.
- **Shopping mode** for the aisle: large rows, the screen kept on, ticked items dropping into the basket.
- **Sharing** by a link: the people you invite see and edit your lists.
- **Offline first:** everything works with no network and syncs in the background.
- **Private at rest:** names, notes and the like are encrypted in the database under the app's own key.

It is a web app that installs like any other (a PWA), with its own database (an sqld service, a SQLite file or PostgreSQL), and people sign in with an
email and a password, through a Sovereign instance, or both.

## Status

**Nothing is built yet beyond the repository.** [`DESIGN.md`](DESIGN.md) is the design, [`ROADMAP.md`](ROADMAP.md) the order of work, and
[`docs/epics/`](docs/epics/) the detail of each task. Phase 1 (0.1.0) is a minimum viable product; [`DESIGN.md`](DESIGN.md) §2.2 says exactly what it
holds.

## Develop

You need Node 24.15 or newer and [pnpm](https://pnpm.io).

```bash
pnpm install --frozen-lockfile
pnpm dev
```

The app is on <http://localhost:3007>. [`CONTRIBUTING.md`](CONTRIBUTING.md) says how a change is made, and [`AGENTS.md`](AGENTS.md) holds the rules of the
app and the commands.

## Licence

[AGPL-3.0-or-later](LICENSE), since it bundles `@sovereignfs/ui`.
