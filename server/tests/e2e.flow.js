/* eslint-disable no-console */
/**
 * End-to-end business flow test against a running API (seeded database).
 *   npm run seed && npm start   (in another terminal)
 *   npm run test:e2e
 *
 * Covers: product → barcode → labels → purchase → receive → scan → sale (split payment) → print data →
 * stock deduction → return → exchange → transfer → purchase return → adjustment → cancel → cash session →
 * hold/recall → reports → audit, plus validation / RBAC rejections and a full stock-ledger consistency check.
 */
const assert = require('assert');
const mongoose = require('mongoose');
const env = require('../src/config/env');

const BASE = process.env.API_URL || `http://localhost:${env.port}/api`;
let passed = 0;
const results = [];

async function call(token, method, path, body, branch) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(branch ? { 'x-branch-id': branch } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}
const ok = (r, label) => {
  if (!r.success) throw new Error(`${label}: expected success, got ${r.status} ${r.message}`);
  return r.data;
};
const fails = (r, status, label, re) => {
  assert.strictEqual(r.success, false, `${label}: expected failure but succeeded`);
  assert.strictEqual(r.status, status, `${label}: expected ${status}, got ${r.status} (${r.message})`);
  if (re) assert.match(r.message, re, `${label}: message "${r.message}"`);
};
async function step(name, fn) {
  try {
    await fn();
    passed += 1;
    results.push(['PASS', name]);
    console.log(`  ✔ ${name}`);
  } catch (e) {
    results.push(['FAIL', name, e.message]);
    console.log(`  ✘ ${name}\n      ${e.message}`);
  }
}

async function login(username, password) {
  const r = await call(null, 'POST', '/auth/login', { username, password });
  return ok(r, `login ${username}`);
}
const stockOf = async (token, branch, variantId) => (await call(token, 'GET', `/stock/variant/${variantId}`, null, branch)).data.find((b) => b.branchId === branch)?.current ?? 0;

(async () => {
  console.log(`\nUnizova POS E2E against ${BASE}\n`);
  const admin = await login('admin', 'admin123');
  const A = admin.accessToken;
  const ngl = admin.branches.find((b) => b.code === 'NGL')._id;
  const tvm = admin.branches.find((b) => b.code === 'TVM')._id;
  const cashierLogin = await login('cashier', 'cashier123');
  const C = cashierLogin.accessToken;
  const ctx = {};

  await step('Masters available (category, brand, supplier)', async () => {
    const cats = ok(await call(A, 'GET', '/categories?all=true&parentId=root'), 'cats');
    ctx.cat = cats.items.find((c) => c.name === 'T-Shirts');
    ctx.brand = ok(await call(A, 'GET', '/brands?all=true'), 'brands').items[0];
    ctx.supplier = ok(await call(A, 'GET', '/suppliers?all=true'), 'sup').items.find((s) => s.stateCode === '33');
    assert(ctx.cat && ctx.brand && ctx.supplier);
  });

  const stamp = Date.now().toString().slice(-6);
  await step('Create product with size/colour variants (auto SKU + EAN-13 barcodes)', async () => {
    const p = ok(await call(A, 'POST', '/products', {
      productCode: `E2ET${stamp}`, name: `E2E Oversized Tee ${stamp}`, categoryId: ctx.cat._id, brandId: ctx.brand._id, gstRate: 5, hsnCode: '6109',
      purchasePrice: 300, sellingPrice: 999, mrp: 1199, gender: 'Unisex',
      variants: [{ color: 'Black', size: 'M' }, { color: 'Black', size: 'L' }, { color: 'White', size: 'M', sellingPrice: 899 }],
    }, ngl), 'create product');
    assert.strictEqual(p.variants.length, 3);
    p.variants.forEach((v) => assert.match(v.barcode, /^\d{13}$/));
    ctx.product = p;
    [ctx.vM, ctx.vL, ctx.vW] = p.variants;
  });

  await step('Reject duplicate barcode, duplicate SKU, invalid GST, selling > MRP', async () => {
    fails(await call(A, 'POST', '/products', { productCode: `X${stamp}`, name: 'Dup', categoryId: ctx.cat._id, gstRate: 5, sellingPrice: 10, mrp: 10, variants: [{ size: 'S', barcode: ctx.vM.barcode }] }), 409, 'dup barcode', /Duplicate barcode/);
    fails(await call(A, 'POST', '/products', { productCode: `X${stamp}`, name: 'Dup', categoryId: ctx.cat._id, gstRate: 5, sellingPrice: 10, mrp: 10, variants: [{ size: 'S', sku: ctx.vM.sku }] }), 409, 'dup sku', /SKU/);
    fails(await call(A, 'POST', '/products', { productCode: `X${stamp}`, name: 'Bad GST', categoryId: ctx.cat._id, gstRate: 7, sellingPrice: 10, mrp: 10, variants: [{ size: 'S' }] }), 400, 'gst', /GST/);
    fails(await call(A, 'POST', '/products', { productCode: `X${stamp}`, name: 'Bad price', categoryId: ctx.cat._id, gstRate: 5, sellingPrice: 20, mrp: 10, variants: [{ size: 'S' }] }), 400, 'price', /MRP/);
    fails(await call(A, 'POST', '/products', { productCode: `X${stamp}`, name: 'Bad EAN', categoryId: ctx.cat._id, gstRate: 5, sellingPrice: 10, mrp: 10, variants: [{ size: 'S', barcode: '8901234567891' }] }), 400, 'ean', /check digit/);
  });

  await step('Barcode validation + label data generation', async () => {
    const v = ok(await call(A, 'POST', '/barcodes/validate', { code: ctx.vM.barcode }), 'validate');
    assert.strictEqual(v.valid, false);
    const labels = ok(await call(A, 'POST', '/barcodes/labels', { items: [{ variantId: ctx.vM._id, qty: 3 }] }), 'labels');
    assert.strictEqual(labels[0].qty, 3);
    assert.strictEqual(labels[0].barcode, ctx.vM.barcode);
  });

  await step('Purchase (draft) → receive → branch stock increases + ledger', async () => {
    const before = await stockOf(A, ngl, ctx.vM._id);
    const p = ok(await call(A, 'POST', '/purchases', {
      branchId: ngl, supplierId: ctx.supplier._id, invoiceNumber: `E2E-${stamp}`, invoiceDate: new Date().toISOString(),
      items: [{ variantId: ctx.vM._id, qty: 20, rate: 300 }, { variantId: ctx.vL._id, qty: 15, rate: 300 }, { variantId: ctx.vW._id, qty: 10, rate: 280 }],
    }, ngl), 'purchase draft');
    assert.strictEqual(p.status, 'draft');
    assert.strictEqual(await stockOf(A, ngl, ctx.vM._id), before, 'draft must not change stock');
    const r = ok(await call(A, 'POST', `/purchases/${p._id}/receive`, {}, ngl), 'receive');
    assert.strictEqual(r.status, 'received');
    assert.strictEqual(await stockOf(A, ngl, ctx.vM._id), before + 20);
    ctx.purchase = r;
    fails(await call(A, 'POST', '/purchases', { branchId: ngl, supplierId: ctx.supplier._id, invoiceNumber: `E2E-${stamp}`, invoiceDate: new Date().toISOString(), items: [{ variantId: ctx.vM._id, qty: 1, rate: 1 }] }, ngl), 409, 'duplicate supplier invoice');
  });

  await step('Scan barcode → exact variant with branch stock', async () => {
    const v = ok(await call(C, 'GET', `/barcodes/lookup/${ctx.vL.barcode}`), 'lookup');
    assert.strictEqual(v._id, ctx.vL._id);
    assert.strictEqual(v.size, 'L');
    assert.strictEqual(v.stock, 15);
    fails(await call(C, 'GET', '/barcodes/lookup/0000000000000'), 404, 'unknown barcode', /Product Not Found/);
  });

  await step('POS sale with split payment (cash + UPI) → stock deducted, invoice number, payments', async () => {
    const s = ok(await call(C, 'POST', '/sales', {
      items: [{ variantId: ctx.vM._id, qty: 2 }, { variantId: ctx.vW._id, qty: 1 }],
      payments: [{ mode: 'cash', amount: 1000 }, { mode: 'upi', amount: 1897, reference: 'UPI123' }],
    }), 'sale');
    assert.match(s.sale.invoiceNumber, /^INV-\d{4}-\d{6}$/);
    assert.strictEqual(s.sale.totals.grandTotal, 2897);
    assert.strictEqual(s.sale.totals.cgst + s.sale.totals.sgst, s.sale.totals.totalTax);
    assert.strictEqual(await stockOf(A, ngl, ctx.vM._id), 18);
    assert.strictEqual(await stockOf(A, ngl, ctx.vW._id), 9);
    assert(s.branch && s.company && s.items.length === 2, 'invoice payload for printing');
    ctx.sale = s;
  });

  await step('Cash overpayment returns change; short payment rejected', async () => {
    const s = ok(await call(C, 'POST', '/sales', { items: [{ variantId: ctx.vL._id, qty: 1 }], payments: [{ mode: 'cash', amount: 1000 }] }), 'sale change');
    assert.strictEqual(s.sale.changeReturned, 1);
    fails(await call(C, 'POST', '/sales', { items: [{ variantId: ctx.vL._id, qty: 1 }], payments: [{ mode: 'cash', amount: 500 }] }), 400, 'short', /short/);
    fails(await call(C, 'POST', '/sales', { items: [{ variantId: ctx.vL._id, qty: 1 }], payments: [{ mode: 'upi', amount: 2000 }] }), 400, 'non-cash excess');
  });

  await step('RBAC: unauthorized discount / price change / cancellation rejected for cashier', async () => {
    fails(await call(C, 'POST', '/sales', { items: [{ variantId: ctx.vL._id, qty: 1, discountPercent: 50 }], payments: [{ mode: 'cash', amount: 500 }] }), 403, 'discount limit', /exceeds your limit/);
    fails(await call(C, 'POST', '/sales', { items: [{ variantId: ctx.vL._id, qty: 1, rate: 500 }], payments: [{ mode: 'cash', amount: 500 }] }), 403, 'price change', /Unauthorized price change/);
    fails(await call(C, 'POST', `/sales/${ctx.sale.sale._id}/cancel`, { reason: 'test' }), 403, 'cancel');
    fails(await call(C, 'GET', '/users'), 403, 'user mgmt');
    fails(await call(C, 'GET', '/barcodes/lookup/x', null, tvm), 403, 'other branch');
  });

  await step('Allowed discount within limit (10%) is applied with correct GST', async () => {
    const s = ok(await call(C, 'POST', '/sales', { items: [{ variantId: ctx.vL._id, qty: 1, discountPercent: 10 }], payments: [{ mode: 'card', amount: 899 }] }), 'disc sale');
    assert.strictEqual(s.sale.totals.grandTotal, 899);
    assert.strictEqual(s.sale.totals.discount, 99.9);
  });

  await step('Negative stock prevented', async () => {
    fails(await call(C, 'POST', '/sales', { items: [{ variantId: ctx.vW._id, qty: 500 }], payments: [{ mode: 'cash', amount: 449500 }] }), 400, 'neg stock', /Insufficient stock/);
  });

  await step('Concurrency: 12 cashiers racing for 5 units → exactly 5 sales, unique invoice numbers', async () => {
    const p = ok(await call(A, 'POST', '/products', {
      productCode: `E2EK${stamp}`, name: `E2E Race Kurti ${stamp}`, categoryId: ctx.cat._id, gstRate: 5, sellingPrice: 500, mrp: 600,
      variants: [{ color: 'Red', size: 'M', openingStock: 5 }], openingStockBranchId: ngl,
    }, ngl), 'race product');
    const v = p.variants[0];
    const attempts = await Promise.all(Array.from({ length: 12 }, () => call(C, 'POST', '/sales', { items: [{ variantId: v._id, qty: 1 }], payments: [{ mode: 'cash', amount: 500 }] })));
    const okSales = attempts.filter((r) => r.success);
    assert.strictEqual(okSales.length, 5, `expected 5 successful sales, got ${okSales.length}`);
    attempts.filter((r) => !r.success).forEach((r) => assert.match(r.message, /Insufficient stock/));
    assert.strictEqual(new Set(okSales.map((r) => r.data.sale.invoiceNumber)).size, 5, 'invoice numbers must be unique');
    assert.strictEqual(await stockOf(A, ngl, v._id), 0);
  });

  await step('Hold bill → list → recall → delete', async () => {
    const h = ok(await call(C, 'POST', '/sales/hold', { items: [{ variantId: ctx.vM._id, qty: 1, rate: 999 }], amount: 999 }), 'hold');
    const list = ok(await call(C, 'GET', '/sales/hold'), 'list');
    assert(list.some((x) => x._id === h._id));
    const full = ok(await call(C, 'GET', `/sales/hold/${h._id}`), 'recall');
    assert.strictEqual(full.items[0].stock, 18);
    ok(await call(C, 'DELETE', `/sales/hold/${h._id}`), 'delete hold');
  });

  await step('Partial sales return → stock increases; return > sold rejected', async () => {
    const itemM = ctx.sale.items.find((i) => i.variantId === ctx.vM._id);
    fails(await call(C, 'POST', '/returns', { saleId: ctx.sale.sale._id, items: [{ saleItemId: itemM._id, qty: 5 }], refundMode: 'cash', reason: 'too many' }), 400, 'over return', /exceeds sold qty/);
    const r = ok(await call(C, 'POST', '/returns', { saleId: ctx.sale.sale._id, items: [{ saleItemId: itemM._id, qty: 1 }], refundMode: 'cash', reason: 'size issue' }), 'return');
    assert.strictEqual(r.refundAmount, 999);
    assert.strictEqual(await stockOf(A, ngl, ctx.vM._id), 19);
  });

  await step('Exchange Black M → Black L (even) and → higher priced item (customer pays)', async () => {
    const inv = ok(await call(C, 'GET', `/sales/invoice/${ctx.sale.sale.invoiceNumber}`), 'invoice');
    const itemM = inv.items.find((i) => i.variantId === ctx.vM._id);
    const lBefore = await stockOf(A, ngl, ctx.vL._id);
    const ex = ok(await call(C, 'POST', '/exchanges', { saleId: inv.sale._id, returnItems: [{ saleItemId: itemM._id, qty: 1 }], newItems: [{ variantId: ctx.vL._id, qty: 1 }], reason: 'size change' }), 'exchange');
    assert.strictEqual(ex.difference, 0);
    assert.strictEqual(await stockOf(A, ngl, ctx.vM._id), 20);
    assert.strictEqual(await stockOf(A, ngl, ctx.vL._id), lBefore - 1);
    const itemW = inv.items.find((i) => i.variantId === ctx.vW._id);
    const ex2 = ok(await call(C, 'POST', '/exchanges', { saleId: inv.sale._id, returnItems: [{ saleItemId: itemW._id, qty: 1 }], newItems: [{ variantId: ctx.vL._id, qty: 1 }], payments: [{ mode: 'upi', amount: 100 }], reason: 'upgrade' }), 'exchange 2');
    assert.strictEqual(ex2.difference, 100);
    assert.strictEqual(ex2.settlement, 'collect');
  });

  await step('Stock transfer NGL → TVM: over-transfer rejected; send deducts source; receive adds destination', async () => {
    fails(await call(A, 'POST', '/transfers', { fromBranchId: ngl, toBranchId: tvm, items: [{ variantId: ctx.vM._id, qty: 9999 }] }), 400, 'over transfer', /exceeds available/);
    const t = ok(await call(A, 'POST', '/transfers', { fromBranchId: ngl, toBranchId: tvm, items: [{ variantId: ctx.vM._id, qty: 10 }], send: true }), 'transfer');
    assert.strictEqual(t.status, 'sent');
    assert.strictEqual(await stockOf(A, ngl, ctx.vM._id), 10);
    assert.strictEqual(await stockOf(A, tvm, ctx.vM._id), 0);
    const r = ok(await call(A, 'POST', `/transfers/${t._id}/receive`, {}), 'receive');
    assert.strictEqual(r.status, 'received');
    assert.strictEqual(await stockOf(A, tvm, ctx.vM._id), 10);
    const t2 = ok(await call(A, 'POST', '/transfers', { fromBranchId: ngl, toBranchId: tvm, items: [{ variantId: ctx.vM._id, qty: 2 }], send: true }), 'transfer2');
    ok(await call(A, 'POST', `/transfers/${t2._id}/cancel`, { reason: 'wrong branch' }), 'cancel transfer');
    assert.strictEqual(await stockOf(A, ngl, ctx.vM._id), 10, 'cancelled transfer returns stock');
  });

  await step('Purchase return decreases stock and supplier payable', async () => {
    const before = await stockOf(A, ngl, ctx.vW._id);
    const p = ctx.purchase.items.find((i) => i.variantId === ctx.vW._id);
    const r = ok(await call(A, 'POST', '/purchases/returns', { purchaseId: ctx.purchase._id, items: [{ purchaseItemId: p._id, qty: 2 }], reason: 'damaged' }, ngl), 'purchase return');
    assert.strictEqual(r.totalQty, 2);
    assert.strictEqual(await stockOf(A, ngl, ctx.vW._id), before - 2);
  });

  await step('Stock adjustment (damage) with audit trail', async () => {
    const before = await stockOf(A, ngl, ctx.vW._id);
    const adj = ok(await call(A, 'POST', '/stock/adjustments', { branchId: ngl, type: 'damage', reason: 'torn', items: [{ variantId: ctx.vW._id, qty: 1 }] }, ngl), 'adjust');
    assert.strictEqual(adj.items[0].qty, -1);
    assert.strictEqual(await stockOf(A, ngl, ctx.vW._id), before - 1);
    const logs = ok(await call(A, 'GET', '/audit-logs?action=stock.adjustment', null, 'all'), 'audit');
    assert(logs.items.some((l) => l.refNo === adj.adjustmentNo));
  });

  await step('Cash session: open → cash sale → close with expected vs actual', async () => {
    const existing = ok(await call(C, 'GET', '/cash/current'), 'current');
    if (existing) ok(await call(C, 'POST', '/cash/close', { actualClosing: existing.summary.expected }), 'close old');
    ok(await call(C, 'POST', '/cash/open', { openingCash: 2000 }), 'open');
    ok(await call(C, 'POST', '/sales', { items: [{ variantId: ctx.vM._id, qty: 1 }], payments: [{ mode: 'cash', amount: 999 }] }), 'cash sale');
    ok(await call(C, 'POST', '/cash/movement', { type: 'out', amount: 500, reason: 'bank deposit' }), 'cash out');
    const cur = ok(await call(C, 'GET', '/cash/current'), 'current');
    assert.strictEqual(cur.summary.expected, 2000 + 999 - 500);
    const closed = ok(await call(C, 'POST', '/cash/close', { actualClosing: 2490 }), 'close');
    assert.strictEqual(closed.difference, -9);
  });

  await step('Manager cancels a bill → stock & payments reversed', async () => {
    const mgr = (await login('manager', 'manager123')).accessToken;
    const s = ok(await call(C, 'POST', '/sales', { items: [{ variantId: ctx.vM._id, qty: 1 }], payments: [{ mode: 'cash', amount: 999 }] }), 'sale');
    const before = await stockOf(A, ngl, ctx.vM._id);
    ok(await call(mgr, 'POST', `/sales/${s.sale._id}/cancel`, { reason: 'customer left' }), 'cancel');
    assert.strictEqual(await stockOf(A, ngl, ctx.vM._id), before + 1);
    fails(await call(mgr, 'POST', `/sales/${s.sale._id}/cancel`, { reason: 'again' }), 400, 'double cancel');
  });

  await step('Customer credit sale → outstanding → receipt', async () => {
    const cust = ok(await call(C, 'POST', '/customers', { name: `E2E Customer ${stamp}`, mobile: `9${stamp}123`.slice(0, 10) }), 'customer');
    fails(await call(C, 'POST', '/customers', { name: 'dup', mobile: cust.mobile }), 409, 'dup mobile');
    ok(await call(C, 'POST', '/sales', { customerId: cust._id, items: [{ variantId: ctx.vM._id, qty: 1 }], payments: [{ mode: 'cash', amount: 499 }, { mode: 'credit', amount: 500 }] }), 'credit sale');
    const prof = ok(await call(A, 'GET', `/customers/${cust._id}`), 'profile');
    assert.strictEqual(prof.customer.outstanding, 500);
    assert.strictEqual(prof.customer.loyaltyPoints, 9); // 1 point per ₹100 of bill value
    ok(await call(A, 'POST', '/payments/customer-receipt', { customerId: cust._id, amount: 500, mode: 'upi' }, ngl), 'receipt');
    assert.strictEqual(ok(await call(A, 'GET', `/customers/${cust._id}`), 'p2').customer.outstanding, 0);
  });

  await step('All reports run without error (all branches)', async () => {
    const cat = ok(await call(A, 'GET', '/reports', null, 'all'), 'catalogue');
    assert(cat.length >= 35, `expected 35+ reports, got ${cat.length}`);
    for (const r of cat) {
      const d = ok(await call(A, 'GET', `/reports/${r.key}?limit=5`, null, 'all'), r.key);
      assert(Array.isArray(d.rows), r.key);
    }
    const dash = ok(await call(A, 'GET', '/dashboard', null, 'all'), 'dashboard');
    assert(dash.cards.todayBills > 0);
  });

  await step('Backup can be created', async () => {
    const b = ok(await call(A, 'POST', '/backups', {}), 'backup');
    assert(b.documents > 0 && b.size > 0);
  });

  await step('Stock integrity: every Stock row equals the sum of its ledger and the formula', async () => {
    await mongoose.connect(env.mongoUri);
    const { Stock, StockLedger } = require('../src/models');
    const ledger = await StockLedger.aggregate([{ $group: { _id: { b: '$branchId', v: '$variantId' }, q: { $sum: '$qty' } } }]);
    const lm = new Map(ledger.map((l) => [`${l._id.b}|${l._id.v}`, l.q]));
    const stocks = await Stock.find().lean();
    let bad = 0;
    for (const s of stocks) {
      const formula = s.opening + s.purchased + s.transferIn + s.salesReturned - s.sold - s.purchaseReturned - s.transferOut + s.adjustment;
      if (formula !== s.current || (lm.get(`${s.branchId}|${s.variantId}`) || 0) !== s.current) bad += 1;
      if (s.current < 0) bad += 1;
    }
    await mongoose.disconnect();
    assert.strictEqual(bad, 0, `${bad} stock rows inconsistent`);
    console.log(`      (${stocks.length} stock rows verified against ${ledger.length} ledger groups)`);
  });

  const failed = results.filter((r) => r[0] === 'FAIL');
  console.log(`\n${passed} passed, ${failed.length} failed\n`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
