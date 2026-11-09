# Epic 11: Portability

## Status

📋 Planned.

## Overview

A person can take their households with them, bring them back, and bring in what the legacy plugin held. Encrypted backup to Git is a later candidate
(15.1).

## Related

[`DESIGN.md`](../../DESIGN.md) §18 · the plugin's `app/_lib/portability.ts` in `sovereignfs/sovereign-plugin-shopper`

## Tasks

#### 📋 11.1 — Export

**Goal:** one file of what is the person's to take. **Design:** §18.1. **Depends on:** 7.1, 3.5.

**Technical:** `src/portability/format.ts` (`format: "shopper"`, `version: 1`, a schema both export and import validate against); export of the
profile and settings and every household the person is in, whole, with members by name only and no other person's email, sealed fields in plain text;
downloaded from Settings > Data with a sentence that the file is not encrypted; an activity line on core when hosted (10.1).

**Accepts when:** the file validates against the schema, holds every household whole, and holds no other person's email.

#### 📋 11.2 — Import

**Goal:** households made from a file. **Design:** §18.2. **Depends on:** 11.1.

**Technical:** validate the whole file first; new shared households with the importer as Admin and other members as `imported` persons; the exporter's
own household merged into the importer's own (lists added, products folded by name key, categories matched by name, trips added); new ids mapped
consistently; one transaction per household; within the limits; a newer version refused with a sentence.

**Accepts when:** the round trip (export, import into a second account, export again) matches but for ids, times and members' kind; a malformed file
writes nothing.

#### 📋 11.3 — Import from the plugin

**Goal:** the legacy plugin's data in the person's own household. **Design:** §18.3. **Depends on:** 11.2, 4.3.

**Technical:** `src/portability/plugin.ts` reads the plugin's export section (`fs.sovereign.shopper`, export schema version 1), alone or inside the
platform's export file; the mapping of §18.3 (lists; products folded, categories by name, icons mapped through the starter catalog's set; open items;
purchases as trips per buyer per local day, other buyers as one imported person, prices in another currency dropped and counted; shares, user state
and households skipped); a summary at the end. The test fixture is produced by running the plugin's own export code over its seed, checked in with the
code that made it.

**Accepts when:** journey 11 of §3 passes; the fixture imports with the expected counts; a second import of the same file folds rather than duplicates
products, and says how many trips it added.
