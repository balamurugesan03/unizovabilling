/* eslint-disable no-console, no-await-in-loop */
/**
 * Demo seed: company, 3 branches, roles, users, categories, brands, suppliers, products with
 * size/colour variants + barcodes, purchases (stock), customers, expenses and ~30 days of sales.
 * All stock-affecting data goes through the real services so the Stock + StockLedger stay consistent.
 *
 *   npm run seed            -> wipes the database and seeds
 *   npm run seed -- --no-sales   -> skip historical demo sales
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { connectDB } = require('../config/db');
const M = require('../models');
const { DEFAULT_ROLES, PERMISSIONS } = require('../constants/permissions');
const productService = require('../services/product.service');
const purchaseService = require('../services/purchase.service');
const saleService = require('../services/sale.service');
const settingsService = require('../services/settings.service');

const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function ctxFor(user, role, branchId) {
  return {
    user, role, companyId: user.companyId, perms: new Set(role.permissions), isSuperAdmin: role.code === 'super_admin',
    allowedBranchIds: null, branchId: branchId ? new mongoose.Types.ObjectId(String(branchId)) : null,
    branchScope: branchId ? { branchId } : {}, ip: '127.0.0.1', headers: { 'user-agent': 'seed' },
  };
}

async function main() {
  await connectDB();
  const withSales = !process.argv.includes('--no-sales');
  console.log('[seed] dropping database', mongoose.connection.name);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  settingsService.clearCache();
  await M.Permission.insertMany(PERMISSIONS);

  const company = await M.Company.create({
    name: 'Unizova', legalName: 'Unizova Technologies', logoUrl: '/unizova-logo.jpeg', code: 'FSPL', gstin: '33AABCF1234K1Z5', pan: 'AABCF1234K',
    email: 'accounts@fashionstore.in', phone: '04652-220011', website: 'www.fashionstore.in',
    address: { line1: '12, Main Road', line2: 'Vadasery', city: 'Nagercoil', state: 'Tamil Nadu', stateCode: '33', pincode: '629001' },
  });
  await M.Settings.create({ companyId: company._id });

  const branches = await M.Branch.insertMany([
    { companyId: company._id, name: 'Nagercoil', code: 'NGL', gstin: '33AABCF1234K1Z5', phone: '04652-220011', stateCode: '33', isDefault: true, managerName: 'Ravi Kumar', address: { line1: '12, Main Road, Vadasery', city: 'Nagercoil', state: 'Tamil Nadu', stateCode: '33', pincode: '629001' } },
    { companyId: company._id, name: 'Trivandrum', code: 'TVM', gstin: '32AABCF1234K1Z7', phone: '0471-2330044', stateCode: '32', managerName: 'Anil Nair', address: { line1: 'MG Road, Statue', city: 'Thiruvananthapuram', state: 'Kerala', stateCode: '32', pincode: '695001' } },
    { companyId: company._id, name: 'Chennai', code: 'CHN', gstin: '33AABCF1234K1Z5', phone: '044-24345566', stateCode: '33', managerName: 'Priya S', address: { line1: '45, Usman Road, T. Nagar', city: 'Chennai', state: 'Tamil Nadu', stateCode: '33', pincode: '600017' } },
  ]);
  const [ngl, tvm, chn] = branches;

  const roles = {};
  for (const r of DEFAULT_ROLES) roles[r.code] = await M.Role.create({ ...r, companyId: company._id });

  const mkUser = async (name, username, password, role, branchIds) => M.User.create({
    companyId: company._id, name, username, passwordHash: await bcrypt.hash(password, 10), roleId: roles[role]._id,
    branchIds: branchIds.map((b) => b._id), defaultBranchId: branchIds[0]?._id, mobile: `98${rint(10000000, 99999999)}`,
  });
  const admin = await mkUser('Administrator', 'admin', 'admin123', 'super_admin', branches);
  await mkUser('Company Admin', 'companyadmin', 'company123', 'company_admin', branches);
  await mkUser('Ravi Kumar (Manager)', 'manager', 'manager123', 'branch_manager', [ngl]);
  const cashier = await mkUser('Meena (Cashier)', 'cashier', 'cashier123', 'cashier', [ngl]);
  const cashier2 = await mkUser('Karthik (Cashier)', 'cashier2', 'cashier123', 'cashier', [chn]);
  const cashier3 = await mkUser('Anjali (Cashier)', 'cashier3', 'cashier123', 'cashier', [tvm]);
  await mkUser('Suresh (Stock)', 'stock', 'stock123', 'stock_manager', branches);
  await mkUser('Lakshmi (Accounts)', 'accountant', 'accounts123', 'accountant', branches);

  const adminCtx = (b) => ctxFor(admin.toObject(), roles.super_admin.toObject(), b?._id);

  // Categories with sub-categories
  const CATS = {
    Shirts: { gst: 5, hsn: '6205', subs: ['Formal Shirts', 'Casual Shirts'] },
    'T-Shirts': { gst: 5, hsn: '6109', subs: ['Round Neck', 'Polo'] },
    Jeans: { gst: 12, hsn: '6203', subs: ['Slim Fit', 'Regular Fit'] },
    Pants: { gst: 5, hsn: '6203', subs: ['Formal Trousers', 'Chinos'] },
    Sarees: { gst: 5, hsn: '5007', subs: ['Silk Sarees', 'Cotton Sarees'] },
    Kurtis: { gst: 5, hsn: '6211', subs: ['Straight Kurtis', 'Anarkali'] },
    'Kids Wear': { gst: 5, hsn: '6111', subs: ['Boys', 'Girls'] },
    'Inner Wear': { gst: 5, hsn: '6107', subs: ['Briefs', 'Vests'] },
    Accessories: { gst: 12, hsn: '6217', subs: ['Belts', 'Wallets'] },
    Footwear: { gst: 12, hsn: '6403', subs: ['Sandals', 'Shoes'] },
  };
  const cat = {};
  for (const [name, c] of Object.entries(CATS)) {
    const parent = await M.Category.create({ companyId: company._id, name, defaultGstRate: c.gst, defaultHsnCode: c.hsn });
    cat[name] = { parent, subs: {} };
    for (const s of c.subs) cat[name].subs[s] = await M.Category.create({ companyId: company._id, name: s, parentId: parent._id, defaultGstRate: c.gst, defaultHsnCode: c.hsn });
  }

  const brandNames = ['FS Basics', 'Urban Threads', 'Denim Co', 'Silk Heritage', 'Ethnic Charm', 'Little Stars', 'ComfortFit', 'StepUp', 'Classic Gents', 'Trendz'];
  const brand = {};
  for (const n of brandNames) brand[n] = await M.Brand.create({ companyId: company._id, name: n });

  const suppliers = await M.Supplier.insertMany([
    { companyId: company._id, name: 'Tirupur Knit Fabs', code: 'SUP01', contactPerson: 'Senthil', mobile: '9842012345', gstin: '33AAACT1111A1Z1', stateCode: '33', address: { city: 'Tirupur', state: 'Tamil Nadu' } },
    { companyId: company._id, name: 'Bangalore Denim Mills', code: 'SUP02', contactPerson: 'Ramesh', mobile: '9845098450', gstin: '29AAACB2222B1Z2', stateCode: '29', address: { city: 'Bengaluru', state: 'Karnataka' } },
    { companyId: company._id, name: 'Kanchi Silk House', code: 'SUP03', contactPerson: 'Murugan', mobile: '9443094430', gstin: '33AAACK3333C1Z3', stateCode: '33', address: { city: 'Kanchipuram', state: 'Tamil Nadu' } },
    { companyId: company._id, name: 'Mumbai Fashion Hub', code: 'SUP04', contactPerson: 'Imran', mobile: '9820098200', gstin: '27AAACM4444D1Z4', stateCode: '27', address: { city: 'Mumbai', state: 'Maharashtra' } },
  ]);

  const S = ['S', 'M', 'L', 'XL'];
  const PRODUCTS = [
    { name: 'Round Neck Cotton T-Shirt', cat: 'T-Shirts', sub: 'Round Neck', brand: 'FS Basics', gender: 'Men', colors: ['Black', 'White', 'Navy'], sizes: [...S, 'XXL'], cost: 280, sp: 499, mrp: 599, sup: 0, fabric: 'Cotton' },
    { name: 'Polo T-Shirt', cat: 'T-Shirts', sub: 'Polo', brand: 'Urban Threads', gender: 'Men', colors: ['Maroon', 'Grey', 'Olive'], sizes: S, cost: 420, sp: 799, mrp: 999, sup: 0, fabric: 'Pique Cotton' },
    { name: 'Slim Fit Formal Shirt', cat: 'Shirts', sub: 'Formal Shirts', brand: 'Classic Gents', gender: 'Men', colors: ['White', 'Sky Blue'], sizes: ['38', '40', '42', '44'], cost: 650, sp: 1299, mrp: 1499, sup: 3, fabric: 'Cotton' },
    { name: 'Checked Casual Shirt', cat: 'Shirts', sub: 'Casual Shirts', brand: 'Trendz', gender: 'Men', colors: ['Red Check', 'Blue Check'], sizes: S, cost: 520, sp: 999, mrp: 1199, sup: 3, pattern: 'Checks' },
    { name: 'Slim Fit Stretch Jeans', cat: 'Jeans', sub: 'Slim Fit', brand: 'Denim Co', gender: 'Men', colors: ['Dark Blue', 'Black'], sizes: ['30', '32', '34', '36'], cost: 900, sp: 1799, mrp: 2199, sup: 1, fabric: 'Denim' },
    { name: 'Women High Rise Jeans', cat: 'Jeans', sub: 'Regular Fit', brand: 'Denim Co', gender: 'Women', colors: ['Light Blue'], sizes: ['26', '28', '30', '32'], cost: 850, sp: 1699, mrp: 1999, sup: 1, fabric: 'Denim' },
    { name: 'Cotton Chinos', cat: 'Pants', sub: 'Chinos', brand: 'Urban Threads', gender: 'Men', colors: ['Khaki', 'Navy'], sizes: ['30', '32', '34'], cost: 700, sp: 1399, mrp: 1599, sup: 3 },
    { name: 'Kanchipuram Silk Saree', cat: 'Sarees', sub: 'Silk Sarees', brand: 'Silk Heritage', gender: 'Women', colors: ['Red', 'Green', 'Magenta'], sizes: ['Free'], cost: 5200, sp: 8999, mrp: 9999, sup: 2, fabric: 'Pure Silk', gst: 5 },
    { name: 'Printed Cotton Saree', cat: 'Sarees', sub: 'Cotton Sarees', brand: 'Ethnic Charm', gender: 'Women', colors: ['Yellow', 'Blue'], sizes: ['Free'], cost: 650, sp: 1199, mrp: 1399, sup: 2, fabric: 'Cotton' },
    { name: 'Straight Rayon Kurti', cat: 'Kurtis', sub: 'Straight Kurtis', brand: 'Ethnic Charm', gender: 'Women', colors: ['Pink', 'Teal', 'Black'], sizes: S, cost: 380, sp: 749, mrp: 899, sup: 3, fabric: 'Rayon' },
    { name: 'Boys Cartoon T-Shirt', cat: 'Kids Wear', sub: 'Boys', brand: 'Little Stars', gender: 'Boys', colors: ['Blue', 'Yellow'], sizes: ['2-3Y', '4-5Y', '6-7Y'], cost: 180, sp: 349, mrp: 399, sup: 0 },
    { name: 'Girls Party Frock', cat: 'Kids Wear', sub: 'Girls', brand: 'Little Stars', gender: 'Girls', colors: ['Pink', 'Lavender'], sizes: ['2-3Y', '4-5Y', '6-7Y'], cost: 450, sp: 899, mrp: 999, sup: 3 },
    { name: 'Cotton Briefs (Pack of 3)', cat: 'Inner Wear', sub: 'Briefs', brand: 'ComfortFit', gender: 'Men', colors: ['Assorted'], sizes: ['S', 'M', 'L', 'XL'], cost: 220, sp: 399, mrp: 449, sup: 0 },
    { name: 'Genuine Leather Belt', cat: 'Accessories', sub: 'Belts', brand: 'Classic Gents', gender: 'Men', colors: ['Brown', 'Black'], sizes: ['32', '34', '36'], cost: 300, sp: 699, mrp: 799, sup: 3 },
    { name: 'Casual Sandals', cat: 'Footwear', sub: 'Sandals', brand: 'StepUp', gender: 'Men', colors: ['Brown', 'Black'], sizes: ['7', '8', '9', '10'], cost: 480, sp: 999, mrp: 1199, sup: 3 },
  ];

  const created = [];
  for (const p of PRODUCTS) {
    const c = CATS[p.cat];
    const prod = await productService.create(adminCtx(ngl), {
      name: p.name, categoryId: String(cat[p.cat].parent._id), subCategoryId: String(cat[p.cat].subs[p.sub]._id), brandId: String(brand[p.brand]._id),
      gender: p.gender, season: 'All Season', hsnCode: c.hsn, gstRate: p.gst ?? c.gst, unit: 'PCS', purchasePrice: p.cost, sellingPrice: p.sp, mrp: p.mrp,
      supplierId: String(suppliers[p.sup]._id), fabric: p.fabric, pattern: p.pattern, status: 'active',
      variants: p.colors.flatMap((color) => p.sizes.map((size) => ({ color, size }))),
    });
    created.push({ def: p, prod });
  }
  console.log(`[seed] ${created.length} products, ${created.reduce((a, c) => a + c.prod.variants.length, 0)} variants`);

  // Purchases -> stock for each branch
  let inv = 1001;
  for (const b of branches) {
    for (const supIdx of [0, 1, 2, 3]) {
      const items = created.filter((c) => c.def.sup === supIdx).flatMap((c) => c.prod.variants.map((v) => ({
        variantId: String(v._id), qty: c.def.cat === 'Sarees' && c.def.sub === 'Silk Sarees' ? rint(3, 6) : rint(12, 30), rate: c.def.cost,
      })));
      if (!items.length) continue;
      await purchaseService.create(adminCtx(b), {
        branchId: String(b._id), supplierId: String(suppliers[supIdx]._id), invoiceNumber: `${suppliers[supIdx].code}-${inv += 1}`,
        invoiceDate: new Date(Date.now() - 35 * 86400000), items, status: 'received',
      });
    }
  }
  console.log('[seed] purchases received for all branches');

  const custData = [
    ['Arun Prakash', '9876543210', 'Nagercoil'], ['Divya Ramesh', '9876501234', 'Nagercoil'], ['Sanjay Menon', '9447012345', 'Trivandrum'],
    ['Fathima Beevi', '9600123456', 'Chennai'], ['Gokul Raj', '9944332211', 'Nagercoil'], ['Harini Venkat', '9840098400', 'Chennai'],
    ['Joseph Antony', '9443322110', 'Nagercoil'], ['Keerthana M', '9789012345', 'Chennai'],
  ];
  const customers = [];
  for (let i = 0; i < custData.length; i += 1) {
    const [name, mobile, city] = custData[i];
    customers.push(await M.Customer.create({ companyId: company._id, code: await settingsService.nextNumber(company._id, 'customer'), name, mobile, city, state: city === 'Trivandrum' ? 'Kerala' : 'Tamil Nadu', stateCode: city === 'Trivandrum' ? '32' : '33', dob: new Date(1990, i, 10 + i) }));
  }

  const expCats = {};
  for (const n of ['Rent', 'Salary', 'Electricity', 'Transport', 'Maintenance', 'Other Expenses']) expCats[n] = await M.ExpenseCategory.create({ companyId: company._id, name: n });

  if (withSales) {
    const cashierFor = new Map([[String(ngl._id), cashier], [String(chn._id), cashier2], [String(tvm._id), cashier3]]);
    const allVariants = created.flatMap((c) => c.prod.variants);
    let count = 0;
    for (let d = 29; d >= 0; d -= 1) {
      for (const b of branches) {
        const bills = rint(1, d === 0 ? 4 : 3);
        for (let k = 0; k < bills; k += 1) {
          const u = cashierFor.get(String(b._id));
          const ctx = ctxFor(u.toObject(), roles.cashier.toObject(), b._id);
          const lines = [];
          const used = new Set();
          for (let n = 0; n < rint(1, 3); n += 1) {
            const v = rnd(allVariants);
            if (used.has(String(v._id))) continue;
            used.add(String(v._id));
            lines.push({ variantId: String(v._id), qty: rint(1, 2) });
          }
          const cust = Math.random() < 0.55 ? rnd(customers) : null;
          try {
            const priced = await saleService.priceCart(ctx, null, { items: lines, customer: cust, branch: b, settings: await settingsService.get(company._id) });
            const total = priced.totals.grandTotal;
            const mode = rnd(['cash', 'cash', 'upi', 'card']);
            const payments = Math.random() < 0.15 ? [{ mode: 'cash', amount: Math.round(total / 2) }, { mode: 'upi', amount: total - Math.round(total / 2) }] : [{ mode, amount: total }];
            const inv2 = await saleService.create(ctx, { customerId: cust ? String(cust._id) : undefined, items: lines, payments });
            if (d > 0) {
              const when = new Date(Date.now() - d * 86400000);
              when.setHours(rint(10, 20), rint(0, 59));
              const sid = inv2.sale._id;
              // raw collection updates: mongoose treats createdAt as immutable
              await Promise.all([
                M.Sale.collection.updateOne({ _id: sid }, { $set: { createdAt: when, invoiceDate: when } }),
                M.SaleItem.collection.updateMany({ saleId: sid }, { $set: { createdAt: when } }),
                M.Payment.collection.updateMany({ refId: sid }, { $set: { date: when, createdAt: when } }),
                M.StockLedger.collection.updateMany({ refId: sid }, { $set: { createdAt: when } }),
                M.LoyaltyTransaction.collection.updateMany({ refId: sid }, { $set: { createdAt: when } }),
                M.Stock.collection.updateMany({ variantId: { $in: lines.map((l) => new mongoose.Types.ObjectId(l.variantId)) }, branchId: b._id }, { $set: { lastSoldAt: when } }),
              ]);
            }
            count += 1;
          } catch (e) {
            // skip if random pick ran out of stock
          }
        }
      }
    }
    console.log(`[seed] ${count} demo sales over 30 days`);

    for (const b of branches) {
      for (const [n, amt] of [['Rent', 45000], ['Electricity', 6200], ['Transport', 1800], ['Salary', 85000], ['Maintenance', 2500]]) {
        await M.Expense.create({
          companyId: company._id, branchId: b._id, expenseNo: await settingsService.nextNumber(company._id, 'expense'), categoryId: expCats[n]._id, categoryName: n,
          date: new Date(Date.now() - rint(1, 25) * 86400000), amount: amt, paymentMode: n === 'Transport' ? 'cash' : 'bank', paidTo: n, userId: admin._id, userName: admin.name,
        });
      }
    }
  }

  console.log('\n[seed] done. Demo logins:');
  console.table([
    { role: 'Super Admin', username: 'admin', password: 'admin123', branches: 'All' },
    { role: 'Company Admin', username: 'companyadmin', password: 'company123', branches: 'All' },
    { role: 'Branch Manager', username: 'manager', password: 'manager123', branches: 'Nagercoil' },
    { role: 'Cashier', username: 'cashier', password: 'cashier123', branches: 'Nagercoil' },
    { role: 'Cashier', username: 'cashier2', password: 'cashier123', branches: 'Chennai' },
    { role: 'Cashier', username: 'cashier3', password: 'cashier123', branches: 'Trivandrum' },
    { role: 'Stock Manager', username: 'stock', password: 'stock123', branches: 'All (assigned)' },
    { role: 'Accountant', username: 'accountant', password: 'accounts123', branches: 'All' },
  ]);
  const sample = created[0].prod.variants.slice(0, 3).map((v) => ({ product: created[0].prod.name, variant: `${v.color} / ${v.size}`, sku: v.sku, barcode: v.barcode }));
  console.log('Sample barcodes to scan in POS:');
  console.table(sample);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('[seed] failed', e);
  await mongoose.disconnect();
  process.exit(1);
});
