# Epic 15: Later

## Status

🚧 Candidates. None is committed; each waits on the owner's decision before it is planned in detail and placed in a phase.

## Overview

What has been asked for or considered, recorded so it is not lost (`DESIGN.md` §22.3).

## Related

[`DESIGN.md`](../../DESIGN.md) §22.3

## Tasks

#### 🚧 15.1 — Encrypted backup to Git

**Goal:** a household's data kept in a repository the person names, encrypted. **Design:** §22.3. **Depends on:** 11.1.

**Outline:** the export format, encrypted (as the other apps plan their backups), committed on a schedule and on demand; the repository's credential
kept through `src/crypto/`. Wanted by the owner and deferred on 2026-11-09; how it is encrypted follows whatever the suite settles for Tusk's and
Wallet's backups.

#### 🚧 15.2 — Sending a trip to Ledger or Tally

**Goal:** a trip's total where money is kept. **Design:** §22.3. **Depends on:** 7.5.

**Outline:** a link from a trip that opens Ledger's add-expense or Tally's add-expense form pre-filled with the total, date and shop, when the person
has set the other app's address; no shared data, no call between apps, each working alone.

#### 🚧 15.3 — AI through the instance's provider

**Goal:** reading receipts into trip lines, smarter categories, predicting what is running out. **Design:** §22.3. **Depends on:** a model provider
offered by the platform.

**Outline:** waits on the platform; nothing is sent to a third party by Shopper itself.

#### 🚧 15.4 — Other languages

**Goal:** the starter catalog and the parser in more than English. **Design:** §8.6, §22.3. **Depends on:** 4.3, 4.5.

**Outline:** starter entries and number words per language, chosen by the person's locale; the interface's own translation follows the suite's
approach when it has one.
