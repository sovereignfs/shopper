# Epic 14: Capture (phase 3)

## Status

📋 Planned. Detailed at the start of phase 3, after 0.2.0; what is here is the outline each task starts from.

## Overview

Phase 3, release 0.3.0 (`DESIGN.md` §22.2): barcodes scanned on the device, products looked up by barcode through the server, and photos and receipts
stored by Shopper itself, sealed. The browser never calls a third party; files never go through core.

## Related

[`DESIGN.md`](../../DESIGN.md) §22.2 · Roam's `DESIGN.md` §18.3 (files) and §15.6 (photos waiting)

## Tasks

#### 📋 14.1 — Barcode scanning

**Goal:** scan to find or add a product. **Design:** §22.2. **Depends on:** 13.9.

**Technical:** the camera through `getUserMedia`, frames decoded on the device by `BarcodeDetector` where present, otherwise a bundled WebAssembly
decoder (ZXing's, licence checked for AGPL compatibility in this task); a scan finds the household's product by barcode on the device, puts it on the
list (or in the basket in shopping mode), or offers to make one with the barcode kept; works offline for known barcodes.

**Accepts when:** a known barcode adds its product offline in Chromium and WebKit; no frame leaves the device.

#### 📋 14.2 — Lookup by barcode

**Goal:** a name and category for an unknown barcode. **Design:** §22.2. **Depends on:** 14.1.

**Technical:** `/api/lookup/<barcode>` on the server asking Open Food Facts by barcode only, with no account and no other data, cached;
`SHOPPER_PRODUCT_LOOKUP` (`true` by default; `false` turns it off) and a URL setting to point elsewhere; ODbL attribution where its data is shown;
offline, the offer to make a product by hand.

**Accepts when:** an unknown barcode offers a name and category from a recorded answer; with lookup off, nothing is requested; the browser makes no
request outside Shopper.

#### 📋 14.3 — The media store

**Goal:** files stored by Shopper, sealed. **Design:** §22.2. **Depends on:** 13.9.

**Technical:** `/data/media` added to the manifest's `data` and the image; one file per upload named by a random id, sealed with its own data key;
`/api/media/<id>` after the access check, with `Cache-Control: private`, the stored type, `nosniff` and a sandboxing CSP for PDFs; 15 MB a file,
`SHOPPER_MEDIA_MAX_HOUSEHOLD_MB` (default 500) per household; deleted with their rows, an orphan sweep; uploads offline kept on the device and sent
later. Roam's media store copied.

**Accepts when:** a file round-trips sealed on disk; a second person's request reads as not found; limits refuse with a sentence; deletion removes
files.

#### 📋 14.4 — Photos on products and items

**Goal:** a picture of the right thing. **Design:** §22.2. **Depends on:** 14.3.

**Technical:** a photo on a product (shown on its items) or on an item, taken or chosen, resized on the device before upload, with a thumbnail.

**Accepts when:** a photo taken offline appears at once and on other devices after it uploads.

#### 📋 14.5 — Receipts on trips

**Goal:** the receipt with the trip. **Design:** §22.2. **Depends on:** 14.3.

**Technical:** one or more images or PDFs on a trip, from Finish shopping's summary or the trip's page; shown in a viewer; included in export as files
beside the JSON.

**Accepts when:** a receipt added at Finish shopping offline is on the trip on every device once uploaded.

#### 📋 14.6 — Release 0.3.0

**Goal:** phase 3 published. **Depends on:** 14.1–14.5.

**Technical:** a security review of capture and files (`docs/security/0.3.0.md`); the release as 12.4; hosting updated as 12.5, with the `data` path.

**Accepts when:** `ghcr.io/sovereignfs/shopper:0.3.0` is published and hosted.
