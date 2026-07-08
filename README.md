# FloSalon — Planning Document

A salon-focused fork of **FloDesktop**, reusing the same Electron + Next.js + SQLite framework but with a salon-oriented domain model.

This README is a **planning checklist** — every feature and DB table from FloDesktop is listed below. Each item is tagged so we can decide together what to keep, drop, or rework.

## Repo layout

FloSalon is split into multiple repos:

- **FloSalonUI** — shared Next.js frontend, included as a git submodule by both desktop and cloud variants. Small UI changes vs. FloDesktop's frontend.
- **FloSalonDesktop** — Electron + Express + SQLite app (this planning doc's primary target). Embeds `FloSalonUI` as the `frontend/` submodule.
- **FloSalonCloud** — cloud/multi-tenant variant. Also embeds `FloSalonUI` as its frontend submodule.

The shared `FloSalonUI` must stay backend-agnostic enough to talk to either the desktop's in-process Express API or the cloud API (likely via an `API_BASE_URL` env var or runtime config).

## Tag legend

- **KEEP** — bring over as-is
- **REMOVE** — explicitly out of scope (per user)
- **MODIFY** — keep the concept but rework for salon context
- **TBD** — needs a decision

---

## 1. Tech stack & framework (KEEP entirely)

Reuse without changes unless we hit a specific reason to swap.

- **Frontend:** Next.js 16 + React 19 + TypeScript, Tailwind CSS 4, shadcn/ui + Radix, Zustand, Axios, Lucide, Sonner/React Hot Toast, next-themes
- **Backend:** Electron 31, Express 4, TypeScript, better-sqlite3, JWT + bcrypt, ws (WebSocket), Bonjour/mDNS, electron-log, electron-updater
- **Build:** electron-builder (Win NSIS, macOS DMG/MAS, Linux AppImage/deb), x64 + arm64
- **Project layout (FloSalonDesktop):** `main/` (Electron + Express backend), `frontend/` (git submodule → `FloSalonUI`), `tests/`, `assets/`, `build/`
- **Architecture patterns:** single-tenant desktop, in-process Express on :3001, JWT auth, RBAC, SQLite WAL mode, versioned migrations, auto-update via GitHub releases

---

## 2. Features

### POS / Order entry
- Fast item search + category filtering — **MODIFY** (rename to "Services" / "Service entry"; "order" becomes "ticket" or "appointment bill")
- Order types: Dine-in / Takeaway / Delivery — **REMOVE** (single flow only — walk-in or appointment)
- Item quantity & modifier selection — **KEEP** (quantity rare for services but useful for products/retail)
- Special instructions per line item — **KEEP** (e.g. "no fragrance", "extra conditioner")
- Cart with real-time totals — **KEEP**
- Soft-delete + restore line items (manager/owner only) — **KEEP**
- Mobile pairing code for companion app — **TBD**

### Billing & Payments
- Bill numbering (`INV-YYYYMMDD-XXXX`) — **KEEP**
- Multi-payment (Cash, UPI, Card) with payment_details JSON — **KEEP**
- Payment status: unpaid / partial / paid + balance tracking — **KEEP**
- Auto-repair for corrupted payment_details JSON — **KEEP**
- Bill print with templates (Classic / Compact / Detailed) — **KEEP**
- Bill preview before print — **KEEP**
- WhatsApp bill sharing via QR/link — **KEEP**

### Kitchen Management (KDS)
- Standalone KDS app — **REMOVE**
- KDS WebSocket server (port 3002) — **REMOVE**
- Kitchen station configuration — **REMOVE**
- Order item status pipeline (pending → preparing → ready → served) — **MODIFY** (simpler: pending → in-service → done)
- Chef login role — **REMOVE** (replace with "Stylist"?)
- KDS pairing (QR/token) — **REMOVE** (per user)
- Multi-station printer routing — **REMOVE** (single counter printer)

### Inventory
- Product catalog (name, SKU, barcode, price, cost) — **KEEP** (split into Services + Retail Products)
- Product images — **REMOVE** (per user)
- Categories with parent/child + slug + color + icon — **KEEP**
- Stock tracking + low-stock threshold — **MODIFY** (only for retail products, not services)
- COGS via `cb_percent` — **TBD** (useful for retail; less so for services)
- Active/inactive flag — **KEEP**

### Modifiers / Addons
- Addon groups + items + per-product assignment — **MODIFY** (per user: "addon options will be different than the existing ones" — design TBD; salon addons are typically things like add-on treatments, hair length surcharge, premium product upgrade)
- Required / optional with min/max selection — **TBD** (carry over once addon model is defined)

### Tables
- Table CRUD, capacity, floor, section — **REMOVE** (per user)
- Table status (available/occupied/reserved/maintenance) — **REMOVE**
- Table layout (position_x/y) — **REMOVE**
- Per-table kitchen station — **REMOVE**

> Replacement consideration (TBD): salons often manage **chairs/stations/stylists**. Worth deciding whether to add a lightweight "stylist availability" or "chair assignment" model later, or skip entirely for v1.

### Customers / CRM
- Customer DB (name, phone, email, address, notes, country code) — **KEEP**
- Loyalty points balance — **KEEP**
- Visit count + total spend aggregation — **KEEP** (especially valuable for salons)
- Customer search by name/phone/email — **KEEP**
- Birthday / preferences (schema notes) — **KEEP** (salon-critical: preferences, allergies, hair history)
- Wallet balance from loyalty ledger — **KEEP**
- **TBD additions worth considering for salons:** service history per customer, preferred stylist, skin/hair type, allergies, before/after photos

### Loyalty / Rewards
- Earning per order (configurable rate) — **KEEP**
- Expiry (configurable days) — **KEEP**
- Loyalty ledger (credit/debit) — **KEEP**
- Redemption value config — **KEEP**

### Staff Management
- User CRUD with email/password/PIN — **KEEP**
- Roles: owner, manager, cashier, waiter, chef — **MODIFY** → owner, manager, cashier, **stylist** (replaces waiter+chef)
- Per-user category restriction — **KEEP** (e.g. stylist only sees their own service categories)
- Staff performance (orders served, daily sales) — **KEEP** (rename "orders served" → "services performed")
- Active/inactive + search/filter — **KEEP**

### Auth & Authorization
- JWT (24h expiry) — **KEEP**
- RBAC — **KEEP**
- Single-tenant local model — **KEEP**
- Synthetic tenant routing (chef → KDS, others → POS) — **MODIFY** (no chef/KDS branch needed; all roles → POS)
- Bonjour/mDNS service announcement — **KEEP** (handy for LAN companion devices)

### Reporting / Analytics
- Daily summary (revenue, bill count, covers, pending) — **MODIFY** ("covers" → "appointments" or just drop)
- Sales summary by date — **KEEP**
- Order count + status breakdown — **KEEP**
- New customer count per day — **KEEP**
- Top payment methods — **KEEP**
- Running orders count — **KEEP** (in-progress services)
- Occupied tables count — **REMOVE**
- Staff performance metrics — **KEEP**

### Settings
- Business name / timezone / currency / country — **KEEP**
- Tax registration (GSTIN, state code, tax scheme) — **KEEP**
- Billing type (prepaid/postpaid) — **KEEP**
- Bill display options (name/address/phone/GSTIN) — **KEEP**
- Loyalty enable + earning rate + redemption value — **KEEP**
- Cloud sync URL — **TBD**
- Schema version tracking — **KEEP** (start fresh at v1)
- KDS pairing option — **REMOVE** (per user)

### Printing & Thermal Printers
- Network printer (TCP 9100) detection — **KEEP**
- USB / WebUSB printer support — **KEEP**
- Multi-platform detection (mac/win/linux) — **KEEP**
- Auto-detect Epson / Xprinter / Star — **KEEP**
- 58mm / 80mm paper width — **KEEP**
- Default printer selection — **KEEP**
- Receipt print (ESC/POS) — **KEEP**
- KOT (Kitchen Order Ticket) print — **REMOVE**
- Bill template rendering — **KEEP**
- Test print page — **KEEP**
- Printer CRUD + status — **KEEP**

### Database & Backup
- SQLite WAL mode — **KEEP**
- Versioned schema migrations — **KEEP**
- One-click backup with timestamp — **KEEP**
- Restore (full + data-only fallback) — **KEEP**
- Export/import as JSON — **KEEP**
- Startup integrity checks (foreign_key_check, integrity_check) — **KEEP**

### Tax
- India GST (IGST inter-state, CGST+SGST intra-state) — **KEEP**
- Thailand VAT (7% flat) — **KEEP**
- Inclusive / exclusive pricing — **KEEP**
- Per-product tax type + rate — **KEEP**
- Customer state code for inter-state determination — **KEEP**
- Tax breakdown on bills — **KEEP**
- Tax preview endpoint — **KEEP**
- Default rate by business type (5% restaurants/salons in India) — **KEEP**

### Integrations
- WhatsApp share — **KEEP**
- Thermal printer (network + USB) — **KEEP**
- Bonjour/mDNS — **KEEP**
- QR code generation (used for KDS pairing) — **MODIFY** (drop KDS use; keep for bill share / future booking links)
- Local IP detection — **KEEP**
- Electron auto-updater — **KEEP**
- App Store (MAS) build variant — **TBD**

### Electron App Lifecycle
- Auto-update check / download / quit-and-install — **KEEP**
- Tray icon — **KEEP**
- Window management (main + KDS + settings) — **MODIFY** (drop KDS window)
- IPC handlers — **KEEP**
- Hardened runtime (macOS) — **KEEP**

---

## 3. Database tables

### Core (mostly KEEP)

| Table | Status | Notes |
|---|---|---|
| `settings` | **KEEP** | Drop KDS-related keys |
| `users` | **MODIFY** | Role CHECK constraint: drop `chef`+`waiter`, add `stylist` |
| `categories` | **KEEP** | Used for service categorisation (Hair, Nails, Spa, etc.) |
| `products` | **MODIFY** | Drop `image_url`. Add `service_duration_minutes` (TBD). Maybe split into `services` + `retail_products` — or use a `kind` column on the same table |
| `addon_groups` | **MODIFY** | Per user: addons will be redesigned. Schema TBD |
| `addons` | **MODIFY** | Same — redesign pending |
| `addon_group_product` | **TBD** | Depends on new addon design |
| `tables` | **REMOVE** | Per user |
| `customers` | **KEEP** | Possibly add salon-specific fields (preferred stylist, allergies, hair/skin type) — TBD |
| `orders` | **MODIFY** | Drop `type`, `guest_count`, `table_id`, `packaging_charge`, `delivery_charge`. Rename concept to "ticket" or keep "order". Optionally add `stylist_id` |
| `order_items` | **MODIFY** | Drop nothing structural; addon JSON shape changes per new addon design. Optionally add `performed_by_user_id` (which stylist did this service) |
| `bills` | **MODIFY** | Drop `delivery_charge`, `packaging_charge` |
| `kitchen_stations` | **REMOVE** | KDS gone |
| `loyalty_ledger` | **KEEP** | |
| `kds_pairing_tokens` | **REMOVE** | KDS gone |
| `printers` | **KEEP** | |

### Indexes (KEEP, minus KDS-related)

```sql
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active   ON products(is_active);
CREATE INDEX idx_orders_status     ON orders(status);
CREATE INDEX idx_orders_created    ON orders(created_at);
CREATE INDEX idx_orders_user       ON orders(user_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_bills_order       ON bills(order_id);
```

### Relationships affected by removals

- **Drop:** `orders → tables`, `tables → kitchen_stations`, `order_items → kitchen_stations` (via station routing)
- **Keep:** all customer / loyalty / addon / product / bill relationships

---

## 4. API endpoints

### KEEP

- `POST /api/auth/login`, `POST /api/auth/tenants/select`
- `GET/POST /api/orders`, `/api/order-items`
- `GET/POST /api/bills`
- `GET/POST /api/products`, `/api/categories`
- `GET/POST /api/customers`, `GET /api/customers-search`, `GET /api/crm/lookup`
- `GET/POST /api/staff`
- `GET/POST /api/printers`
- `GET/PUT /api/settings/*`
- `GET /api/reports/*`
- `GET /api/db/export`, `POST /api/db/import`
- `POST /api/tax/preview`
- `GET /api/mobile/pairing-code` — **TBD**

### MODIFY

- `GET/POST /api/addon-groups` — schema redesign

### REMOVE

- `GET/POST /api/tables`
- `GET /api/kds/orders`, `PATCH /api/kds/items/:id/status`, `POST /api/kds/pairing`
- `GET /api/kds-info`
- `GET/POST /api/kitchen`, `/api/kitchen-stations`

---

## 5. Open decisions (TBD)

These came up while sorting features and probably need your input before we start migrating code:

1. **Services vs retail products** — single `products` table with a `kind` discriminator, or two separate tables?
2. **Service duration** — do services need a `duration_minutes` field for scheduling/reporting?
3. **Stylist attribution** — record which stylist performed each `order_item` (for commission/performance reporting)?
4. **Chair / station model** — any lightweight "where the service is happening" concept, or skip entirely?
5. **Appointment / booking system** — out of scope for v1, or part of FloSalon from day one? (FloDesktop has none today.)
6. **Addon redesign** — what does the salon addon model look like? (Hair length surcharge tiers? Add-on treatments? Product upgrades?)
7. **Customer salon-specific fields** — preferred stylist, hair type, skin type, allergies, formula history (color formulas), photos?
8. **Roles** — confirm `owner / manager / cashier / stylist`, or different naming?
9. **Mobile companion app** — keep the pairing-code feature, or drop?
10. **Cloud sync** — keep the cloud_server_url plumbing, or remove for v1?
11. **FloSalonUI shape** — single Next.js app shared by desktop + cloud. Need a runtime switch (env var? feature flag?) for the small UI differences between the two deployments. Auth flow differs too (desktop = local JWT + single tenant, cloud = multi-tenant). Worth defining the shared API contract early.

---

## Next step

Review the tags above, flip anything you disagree with, and answer the TBDs in section 5. Once locked, we can scaffold the FloSalon repo by copying FloDesktop and applying the diff (drop tables/routes/UI per REMOVE list, adjust schema, redesign addons).
