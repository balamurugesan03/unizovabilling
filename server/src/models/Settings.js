const { Schema, model } = require('mongoose');

const seriesSchema = new Schema({
  pattern: { type: String, required: true }, // tokens: {YYYY} {YY} {MM} {FY} {BRANCH} {SEQ:n}
  scope: { type: String, enum: ['company', 'branch'], default: 'company' },
  reset: { type: String, enum: ['never', 'yearly', 'financial_year'], default: 'yearly' },
}, { _id: false });

const settingsSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, unique: true },
  invoice: {
    title: { type: String, default: 'TAX INVOICE' },
    showLogo: { type: Boolean, default: true },
    footerNote: { type: String, default: 'Thank you for shopping with us! Visit again.' },
    terms: { type: String, default: 'Goods once sold can be exchanged within 7 days with bill and tags intact.' },
    showHsn: { type: Boolean, default: true },
    showSavings: { type: Boolean, default: true },
  },
  tax: {
    mode: { type: String, enum: ['intra', 'inter', 'auto'], default: 'auto' }, // auto = compare branch & customer state
    taxInclusive: { type: Boolean, default: true }, // selling prices include GST (MRP pricing)
    purchaseTaxInclusive: { type: Boolean, default: false },
  },
  barcode: {
    defaultFormat: { type: String, enum: ['EAN13', 'CODE128'], default: 'EAN13' },
    ean13Prefix: { type: String, default: '890123' },
    code128Prefix: { type: String, default: 'FS' },
    labelSize: { type: String, default: 'STD-2up' },
    labelColumns: { type: Number, default: 1 },
    showStoreName: { type: Boolean, default: true },
    showProductName: { type: Boolean, default: true },
    showSku: { type: Boolean, default: true },
    showSizeColor: { type: Boolean, default: true },
    showMrp: { type: Boolean, default: true },
    showSellingPrice: { type: Boolean, default: true },
  },
  printer: {
    receiptWidth: { type: String, enum: ['58', '80'], default: '80' },
    defaultInvoiceFormat: { type: String, enum: ['thermal', 'a4'], default: 'thermal' },
    autoPrintAfterSale: { type: Boolean, default: true },
    receiptPrinterName: { type: String, default: '' },
    labelPrinterName: { type: String, default: '' },
    copies: { type: Number, default: 1 },
  },
  payment: {
    enabledModes: { type: [String], default: ['cash', 'card', 'upi', 'bank', 'credit', 'store_credit', 'loyalty'] },
    defaultMode: { type: String, default: 'cash' },
    upiId: { type: String, default: '' },
    allowCreditWithoutCustomer: { type: Boolean, default: false },
  },
  discount: {
    allowLineDiscount: { type: Boolean, default: true },
    allowBillDiscount: { type: Boolean, default: true },
    maxBillDiscountPercent: { type: Number, default: 50 },
  },
  stock: {
    allowNegativeStock: { type: Boolean, default: false },
    lowStockThreshold: { type: Number, default: 5 },
    deadStockDays: { type: Number, default: 90 },
  },
  loyalty: {
    enabled: { type: Boolean, default: true },
    amountPerPoint: { type: Number, default: 100 }, // 1 point per ₹100
    pointValue: { type: Number, default: 1 }, // ₹ per point when redeeming
    minRedeemPoints: { type: Number, default: 50 },
  },
  returnPolicy: {
    enabled: { type: Boolean, default: true },
    days: { type: Number, default: 7 },
    text: { type: String, default: 'Returns accepted within 7 days of purchase with original bill. No returns on innerwear & discounted items.' },
  },
  exchangePolicy: {
    enabled: { type: Boolean, default: true },
    days: { type: Number, default: 15 },
    text: { type: String, default: 'Exchange within 15 days with original bill and price tags intact.' },
  },
  cash: {
    requireSessionForBilling: { type: Boolean, default: false },
  },
  numberSeries: {
    invoice: { type: seriesSchema, default: () => ({ pattern: 'INV-{YYYY}-{SEQ:6}', scope: 'company', reset: 'yearly' }) },
    invoiceNoGst: { type: seriesSchema, default: () => ({ pattern: 'NG-{YYYY}-{SEQ:6}', scope: 'company', reset: 'yearly' }) }, // bills made "without GST"
    saleReturn: { type: seriesSchema, default: () => ({ pattern: 'SR-{YYYY}-{SEQ:5}', scope: 'company', reset: 'yearly' }) },
    exchange: { type: seriesSchema, default: () => ({ pattern: 'EX-{YYYY}-{SEQ:5}', scope: 'company', reset: 'yearly' }) },
    purchase: { type: seriesSchema, default: () => ({ pattern: 'PUR-{YYYY}-{SEQ:5}', scope: 'company', reset: 'yearly' }) },
    purchaseReturn: { type: seriesSchema, default: () => ({ pattern: 'PR-{YYYY}-{SEQ:5}', scope: 'company', reset: 'yearly' }) },
    transfer: { type: seriesSchema, default: () => ({ pattern: 'TRF-{YYYY}-{SEQ:5}', scope: 'company', reset: 'yearly' }) },
    adjustment: { type: seriesSchema, default: () => ({ pattern: 'ADJ-{YYYY}-{SEQ:5}', scope: 'company', reset: 'yearly' }) },
    expense: { type: seriesSchema, default: () => ({ pattern: 'EXP-{YYYY}-{SEQ:5}', scope: 'company', reset: 'yearly' }) },
    payment: { type: seriesSchema, default: () => ({ pattern: 'PAY-{YYYY}-{SEQ:6}', scope: 'company', reset: 'yearly' }) },
    hold: { type: seriesSchema, default: () => ({ pattern: 'H-{BRANCH}-{SEQ:4}', scope: 'branch', reset: 'never' }) },
    cashSession: { type: seriesSchema, default: () => ({ pattern: 'CS-{BRANCH}-{SEQ:5}', scope: 'branch', reset: 'never' }) },
    customer: { type: seriesSchema, default: () => ({ pattern: 'CUS{SEQ:6}', scope: 'company', reset: 'never' }) },
    product: { type: seriesSchema, default: () => ({ pattern: 'P{SEQ:6}', scope: 'company', reset: 'never' }) },
  },
}, { timestamps: true, minimize: false });

module.exports = model('Settings', settingsSchema);
