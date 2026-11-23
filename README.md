# Unizova — Multi-Branch Billing, Inventory & Barcode ERP

A production-ready retail system for fashion / garment stores with multiple branches:
barcode-driven POS billing, size/colour variants, GST invoices, purchases, branch stock transfers,
returns & exchanges, customers & loyalty, cash management, 40+ reports, RBAC, audit logs and backups.

**Stack:** React 18 + Vite + Tailwind + Zustand + Recharts + Lucide · Node.js + Express · MongoDB + Mongoose
(multi-document transactions) · JWT access + rotating refresh tokens · Socket.IO · JsBarcode (EAN-13 / Code128).

---

## Quick start (development)

Requirements: **Node.js 18+**, **MongoDB 6+** (`mongod` and `mongosh` on the machine).

```bash
npm run install:all          # installs server + client dependencies

# 1. MongoDB replica set (transactions need one). Starts a local single-node rs on port 27018,
#    data in ./.mongo-data. Leave it running.
npm run db:dev

# 2. Configure the API (first time only)
cp server/.env.example server/.env      # then set the two JWT secrets

# 3. Demo data (WIPES the database)
npm run seed

# 4. Run API (port 5000) and web app (port 5173) in two terminals
npm run dev:server
npm run dev:client
```

Open http://localhost:5173.

| Role | Username | Password | Branches |
|---|---|---|---|
| Super Admin | `admin` | `admin123` | All |
| Company Admin | `companyadmin` | `company123` | All |
| Branch Manager | `manager` | `manager123` | Nagercoil |
| Cashier | `cashier` / `cashier2` / `cashier3` | `cashier123` | Nagercoil / Chennai / Trivandrum |
| Stock Manager | `stock` | `stock123` | All (assigned) |
| Accountant | `accountant` | `accounts123` | All |

Sample barcodes to scan: `8901230000032` (Round Neck T-Shirt Black/L), `8901230000025` (Black/M).
The seed prints more. In POS, `3*8901230000032` adds 3 units in one scan.

> Already running MongoDB as a standalone server (no replica set)? The API still starts and works, but logs a
> warning that **transactions are disabled**. Use `npm run db:dev`, or convert your server to a replica set
> (`replication.replSetName: rs0` in `mongod.cfg` + `rs.initiate()`), for production.

### Tests

```bash
npm run test:e2e     # API running + seeded DB required
```

The end-to-end suite (`server/tests/e2e.flow.js`) walks the full business flow and verifies the rules.
Current result: **24 passed, 0 failed**. It covers:
create product → barcodes → labels → purchase (draft → receive) → scan → split-payment sale → stock deduction →
return → exchange → branch transfer (send / receive / cancel) → purchase return → adjustment → bill cancellation →
cash session close → credit sale & collection → every report → backup. It also checks:
- validation (duplicate barcode / SKU, bad EAN check digit, invalid GST, selling price > MRP, return > sold,
  transfer > stock, negative stock),
- RBAC (discount over the role limit, unauthorized price change or cancellation, another branch's data),
- **concurrency**: 12 parallel cashiers racing for 5 units → exactly 5 sales, unique invoice numbers,
- **stock integrity**: every `Stock` row equals the sum of its `StockLedger` entries and the stock formula.

---

## Features

| Area | What you get |
|---|---|
| **POS billing** | Keyboard-first counter screen; USB/Bluetooth scanner as keyboard input (auto-detects rapid bursts even when focus is elsewhere); repeat scans increase qty; `qty*code` scans; "Product Not Found" → Create / Search / Cancel; split payments (cash, card, UPI, bank, credit, store credit, loyalty) with automatic cash-change; hold / recall; live CGST/SGST/IGST; auto-print |
| **Shortcuts** | Any page: F1 sales (new bill) · F2 sales return popup in billing (scan old bill barcode / invoice no → returned items join the current bill as minus lines at the old price, stock back in) · F4 purchase entry · F5 new product · F6 reports · F7 sales summary (product-wise: qty, profit, cash/GPay/card split, last purchase) · F8 purchase summary · F9 cash payment · F10 cash receipt · F11 GST billing (GPay / card bills) · F12 GST report (each tax rate separately, summary or bill-wise). In POS: F3 direct print last bill · R / row Return button: customer does not want 1 piece → minus line under it (R on the minus line undoes) · Ctrl+R item from an earlier bill → that line turns minus (refund if the bill goes minus) · Alt+S product search · Alt+P / Enter pay · Alt+C customer · Alt+N new customer · Alt+H hold · Alt+R recall · Del remove · Ctrl+Q qty · Ctrl+D item discount · Ctrl+B bill discount · Ctrl+E rate · ↑/↓ select · Esc close · in payment: F10/F11/F12 full cash/card/UPI |
| **Products** | Category / sub-category, brand, gender, season, HSN, GST, fabric/pattern/style, images; size × colour matrix generator; each variant has its own SKU, barcode, prices and stock |
| **Barcodes** | Auto EAN-13 (valid check digit) or Code128, manual barcodes validated, unique per company (registry keeps old codes as alternates); bulk generation; label printing (roll 50×25 / 38×25 / 40×30 / 75×38, A4 65-up / 24-up), choosable fields |
| **Inventory** | Branch × variant `Stock` + immutable `StockLedger` (every movement, running balance); `Current = Opening + Purchase + Transfer In + Sales Return − Sales − Purchase Return − Transfer Out ± Adjustment`; negative stock blocked unless enabled in settings |
| **Purchases** | Draft → receive (stock in, weighted-average cost, optional price update), supplier payable, payments (FIFO allocation), purchase returns (adjust or refund) |
| **Transfers** | Draft → Sent (source stock out) → Received (destination in, partial/shortage receipt) → or Cancelled (stock back); real-time notification to the destination branch |
| **Returns / Exchange** | Full or partial returns against the original bill with refund in cash/card/UPI/bank, store credit or outstanding adjustment; exchange = return + new bill in one transaction, collecting the difference or refunding / crediting it |
| **Customers** | Profile with purchase history, returns, exchanges, outstanding, store credit, loyalty ledger; credit sales and collections |
| **Cash** | Per-cashier sessions: opening, cash sales / refunds / expenses / supplier payments, cash in/out, denomination count, expected vs actual difference |
| **GST** | 0/5/12/18/28 %; prices inclusive or exclusive; CGST+SGST vs IGST (auto by branch vs customer state); rate-wise GST report with ITC, HSN summary |
| **Reports** | 40+ reports (sales by day/month/invoice/branch/product/category/brand/size/colour/cashier/payment; stock current/low/out/valuation/fast/slow/dead/transfer/adjustment; purchase; customers; P&L, cash book, payment summary, GST). All server-side paginated, filterable, Excel / PDF / Print |
| **Admin** | Company, branches, users (branch assignment), roles with module-wise View / Create / Edit / Delete permissions (plus special actions such as discount, price change, returns, financial reports) and a side-by-side permission matrix, per-role max discount, settings (invoice, tax, barcode, printer, payment, discount, stock, loyalty, return/exchange policy, cash, number series like `INV-{YYYY}-{SEQ:6}`), audit log with old/new values, IP and device, backup / download / restore |
| **UX** | Sidebar + header, branch switcher with consolidated "All Branches" view, dark/light mode, toasts, confirmation dialogs, real-time dashboard refresh |

---

## Architecture

```
fashion-pos/
├── server/                     Express API
│   ├── src/
│   │   ├── config/             env, MongoDB connection (detects replica set / transactions)
│   │   ├── constants/          permission catalogue + default roles
│   │   ├── models/             35 Mongoose schemas (one per file) with indexes
│   │   ├── validators/         zod request schemas
│   │   ├── middleware/         auth (JWT + branch scope), permit (RBAC), validate, upload, error
│   │   ├── services/           ALL business logic (stock, sale, return, exchange, purchase, transfer, reports…)
│   │   ├── controllers/        thin HTTP adapters
│   │   ├── routes/             URL → middleware → controller wiring only
│   │   ├── socket/             Socket.IO rooms per company / branch
│   │   ├── seed/               demo data (goes through the real services)
│   │   ├── app.js / server.js
│   ├── scripts/dev-mongo.js    local single-node replica set
│   └── tests/e2e.flow.js       end-to-end business flow test
└── client/                     React + Vite
    └── src/
        ├── lib/                api (token refresh), gst mirror, print (receipt / A4 / labels), export, socket
        ├── store/              zustand: auth/branch, POS cart (persisted), ui
        ├── hooks/              useFetch, useHotkeys, useScanner, useDebounce
        ├── components/         ui kit, DataTable, pickers, layout
        └── pages/              sales, products, purchase, inventory, customers, reports, accounts, admin
```

### Key design decisions

- **Stock is never stored on the product.** `stock.service.applyMovement()` is the only code that changes stock:
  it performs an atomic conditional `$inc` (`current >= qty` unless negative stock is allowed) and writes a
  `StockLedger` row in the same transaction. Concurrent cashiers cannot oversell.
- **Every transactional operation** (sale, return, exchange, purchase receive / return, transfer send / receive /
  cancel, adjustment, cancellation, payments) runs inside `runInTransaction()`, so an invoice and its stock,
  payment, customer and loyalty updates commit or roll back together. Number-series counters are incremented
  inside the same transaction, so there are no gaps or duplicates.
- **The server is authoritative** for prices, discounts and taxes. The client mirrors the GST maths only for display.
  Price changes and discounts are checked against the role's permissions and its maximum discount %.
- **Branch scoping**: the `x-branch-id` header (or `all`) is resolved in `authenticate()`. Branch-restricted users
  can only ever see or modify their assigned branches; consolidated views require an all-branches role.
- **Exchange** is modelled as a `SaleReturn(type=exchange)` plus a new `Sale(type=exchange)` linked by an `Exchange`
  document, so every sales, GST and stock report stays consistent without special cases.
- **Scale**: no screen loads the catalogue. Search and scans hit indexed lookups (`companyId+barcode`, `companyId+sku`).
  Lists and reports use server-side pagination and aggregation pipelines with `$facet` totals.
  Sale lines are stored in `SaleItem` with denormalised category / brand / size / colour for fast analytics.

### Database collections

Company, Branch, User, Role, Permission, RefreshToken, Settings, Counter, Category, Brand, Supplier, Customer,
Product, ProductVariant, Barcode, Stock, StockLedger, StockTransfer, StockTransferItem, StockAdjustment, Purchase,
PurchaseItem, PurchaseReturn, Sale, SaleItem, SaleReturn, Exchange, HeldBill, LoyaltyTransaction, Payment,
ExpenseCategory, Expense, CashSession, AuditLog, Backup.

Notable unique indexes: `ProductVariant {companyId, barcode}` and `{companyId, sku}`, `Barcode {companyId, code}`,
`Product {companyId, productCode}`, `Sale {companyId, branchId, invoiceNumber}`, `Customer {companyId, mobile}`,
`Stock {branchId, variantId}`, `Purchase {companyId, supplierId, invoiceNumber}`.

### REST API

All under `/api`, JSON `{ success, data | message, details }`. Auth: `Authorization: Bearer <access>` plus the
`x-branch-id: <branchId | all>` header.

`/auth` (login, refresh, logout, me, change-password) · `/companies/current` · `/branches` · `/users` · `/roles` ·
`/permissions` · `/products` (+ `/variants`, `/variants/search`, `/images`) · `/categories` · `/brands` ·
`/suppliers` · `/expense-categories` · `/barcodes` (`/lookup/:code`, `/validate`, `/bulk-generate`, `/labels`) ·
`/customers` (+ `/search`, `/loyalty`) · `/purchases` (+ `/:id/receive`, `/:id/cancel`, `/returns`) ·
`/sales` (+ `/hold`, `/invoice/:no`, `/:id/cancel`, `/:id/printed`, `/counter-stats`) · `/returns` · `/exchanges` ·
`/stock` (+ `/ledger`, `/variant/:id`, `/adjustments`) · `/transfers` (+ `/:id/send|receive|cancel`) ·
`/payments` (+ `/customer-receipt`, `/supplier-payment`, `/summary`) · `/expenses` · `/cash`
(`/current`, `/open`, `/movement`, `/close`, `/sessions`) · `/reports` (+ `/:key`) · `/dashboard` ·
`/settings` (+ `/:section`) · `/audit-logs` · `/backups` (+ download / restore / upload-restore) · `/health`.

---

## Printing & hardware

- **Barcode scanners** (USB / Bluetooth HID) work as keyboards. Configure the scanner to send *Enter* after the
  code (the factory default on most models). No driver is needed.
- **Receipts** print through the browser print dialog as 58 mm or 80 mm thermal layouts. A4 invoices are also
  available. Pick the printer in the dialog and set margins to *None*. For silent one-click printing on a
  dedicated counter PC, start Chrome/Edge with `--kiosk-printing` and set the thermal printer as default.
- **Labels**: set the label printer's paper size to the label size (e.g. 50 × 25 mm) or use A4 sticker sheets.
- Browsers cannot select a printer programmatically; the printer names in Settings are a reference for staff.

---

## Production deployment

### Option A — Docker (simplest)

```bash
# .env next to docker-compose.yml
JWT_ACCESS_SECRET=<64 random hex chars>
JWT_REFRESH_SECRET=<another 64 random hex chars>
CORS_ORIGINS=https://pos.yourstore.in

docker compose up -d --build
docker compose exec app npm run seed      # OPTIONAL demo data — wipes the database
```

The app (API + built web client) listens on port 5000. MongoDB runs as a single-node replica set with a
persistent volume. Put a TLS reverse proxy in front (see Nginx below).

### Option B — VM / bare metal (PM2 + Nginx)

1. **MongoDB**: install MongoDB 6+ and enable a replica set (required for transactions):
   `mongod.conf` → `replication: { replSetName: rs0 }`, restart, then `mongosh --eval "rs.initiate()"`.
   Enable authentication and create an application user.
2. **App**:
   ```bash
   npm run install:all
   npm run build                                   # builds client/dist (served by the API)
   cp server/.env.example server/.env              # edit it:
   #   NODE_ENV=production
   #   MONGO_URI=mongodb://appuser:pass@127.0.0.1:27017/fashion_pos?replicaSet=rs0&authSource=admin
   #   JWT_ACCESS_SECRET / JWT_REFRESH_SECRET = long random strings   (the API refuses to start without them)
   #   CORS_ORIGINS=https://pos.yourstore.in
   #   REQUIRE_TRANSACTIONS=true
   npm i -g pm2
   pm2 start server/src/server.js --name fashion-pos && pm2 save && pm2 startup
   ```
3. **Nginx** (TLS via certbot), proxying HTTP and WebSockets:
   ```nginx
   server {
     server_name pos.yourstore.in;
     client_max_body_size 500m;            # backup uploads
     location / {
       proxy_pass http://127.0.0.1:5000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
   }
   ```
4. **First login**: run `npm run seed` only for a demo. For a real store, seed once, then change the
   company / branches / users in Administration and **change every default password**. Alternatively, empty the
   demo products and data before go-live.
5. **Backups**: Administration → Backup creates gzipped full-database snapshots in `server/backups`.
   Download them regularly or sync that folder off-site. Also schedule `mongodump` for point-in-time recovery.
   Restoring always takes an automatic safety backup first.

### Environment variables (`server/.env`)

| Variable | Default | Notes |
|---|---|---|
| `PORT` | 5000 | |
| `MONGO_URI` | `mongodb://127.0.0.1:27018/fashion_pos?replicaSet=rs0` | must point to a replica set for transactions |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | dev values | **required** in production |
| `ACCESS_TOKEN_TTL` | `15m` | access token lifetime |
| `REFRESH_TOKEN_DAYS` | `7` | refresh cookie lifetime (rotated on every use, reuse detection) |
| `CORS_ORIGINS` | `http://localhost:5173` | comma separated |
| `UPLOAD_DIR`, `BACKUP_DIR` | `uploads`, `backups` | relative to `server/` |
| `REPORT_TZ` | `Asia/Kolkata` | day/month grouping in reports |
| `REQUIRE_TRANSACTIONS` | `false` | `true` makes the API refuse to start without a replica set |

---

## Security notes

- Passwords hashed with bcrypt. Refresh tokens are stored hashed, rotated on every use and revoked on password
  change, role change or account disable (`tokenVersion`). Login is rate-limited.
- Helmet, CORS allow-list, request size limits, strict zod validation (unknown fields are stripped), and
  regex-escaped search.
- Every important action is written to the audit log with user, IP, device, and old/new values.
