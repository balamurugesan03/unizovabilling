import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './store/auth';
import Layout from './components/Layout';
import { Loading, Empty } from './components/ui';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const POS = lazy(() => import('./pages/sales/POS'));
const HoldBills = lazy(() => import('./pages/sales/HoldBills'));
const SalesHistory = lazy(() => import('./pages/sales/SalesHistory'));
const SalesReturn = lazy(() => import('./pages/sales/SalesReturn'));
const Exchange = lazy(() => import('./pages/sales/Exchange'));
const Products = lazy(() => import('./pages/products/Products'));
const ProductForm = lazy(() => import('./pages/products/ProductForm'));
const Masters = lazy(() => import('./pages/products/Masters'));
const Variants = lazy(() => import('./pages/products/Variants'));
const BarcodeGenerator = lazy(() => import('./pages/products/BarcodeGenerator'));
const BarcodePrinting = lazy(() => import('./pages/products/BarcodePrinting'));
const PurchaseEntry = lazy(() => import('./pages/purchase/PurchaseEntry'));
const PurchaseHistory = lazy(() => import('./pages/purchase/PurchaseHistory'));
const PurchaseReturns = lazy(() => import('./pages/purchase/PurchaseReturns'));
const CurrentStock = lazy(() => import('./pages/inventory/CurrentStock'));
const StockLedger = lazy(() => import('./pages/inventory/StockLedger'));
const StockAdjustment = lazy(() => import('./pages/inventory/StockAdjustment'));
const StockTransfer = lazy(() => import('./pages/inventory/StockTransfer'));
const Customers = lazy(() => import('./pages/customers/Customers'));
const CustomerProfile = lazy(() => import('./pages/customers/CustomerProfile'));
const Loyalty = lazy(() => import('./pages/customers/Loyalty'));
const Reports = lazy(() => import('./pages/reports/Reports'));
const Cash = lazy(() => import('./pages/accounts/Cash'));
const Payments = lazy(() => import('./pages/accounts/Payments'));
const Expenses = lazy(() => import('./pages/accounts/Expenses'));
const Company = lazy(() => import('./pages/admin/Company'));
const Users = lazy(() => import('./pages/admin/Users'));
const Roles = lazy(() => import('./pages/admin/Roles'));
const SettingsPage = lazy(() => import('./pages/admin/Settings'));
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs'));
const Backup = lazy(() => import('./pages/admin/Backup'));

function Guard({ perm, children }) {
  const can = useAuth((s) => s.can);
  if (perm && !can(...perm)) return <Empty title="Access denied" hint="Your role does not have permission to open this page. Contact your administrator." />;
  return children;
}

function Home() {
  const can = useAuth((s) => s.can);
  if (can('dashboard.view')) return <Dashboard />;
  if (can('sale.create')) return <Navigate to="/pos" replace />;
  return <Empty title="Welcome" hint="Use the menu to get started." />;
}

export default function App() {
  const { ready, user, bootstrap } = useAuth();
  const location = useLocation();
  useEffect(() => { bootstrap(); }, []);
  if (!ready) return <div className="grid h-full place-items-center"><Loading label="Starting Unizova…" /></div>;
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname }} />} />
      </Routes>
    );
  }
  const r = (path, el, perm) => <Route path={path} element={<Guard perm={perm}>{el}</Guard>} />;
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          {r('/pos', <POS />, ['sale.create'])}
          {r('/sales', <SalesHistory />, ['sale.view'])}
          {r('/sales/hold', <HoldBills />, ['sale.create'])}
          {r('/sales/return', <SalesReturn />, ['sale.return'])}
          {r('/sales/exchange', <Exchange />, ['sale.exchange'])}
          {r('/products', <Products />, ['product.view'])}
          {r('/products/new', <ProductForm />, ['product.create'])}
          {r('/products/:id/edit', <ProductForm />, ['product.edit'])}
          {r('/products/categories', <Masters kind="categories" />, ['product.view'])}
          {r('/products/brands', <Masters kind="brands" />, ['product.view'])}
          {r('/products/variants', <Variants />, ['product.view'])}
          {r('/products/barcodes', <BarcodeGenerator />, ['barcode.print'])}
          {r('/products/labels', <BarcodePrinting />, ['barcode.print'])}
          {r('/purchase', <PurchaseHistory />, ['purchase.view', 'purchase.create', 'purchase.edit'])}
          {r('/purchase/new', <PurchaseEntry />, ['purchase.create'])}
          {r('/purchase/:id/edit', <PurchaseEntry />, ['purchase.edit'])}
          {r('/purchase/returns', <PurchaseReturns />, ['purchase.return', 'purchase.view'])}
          {r('/purchase/suppliers', <Masters kind="suppliers" />, ['supplier.view', 'purchase.view'])}
          {r('/inventory', <CurrentStock />, ['stock.view'])}
          {r('/inventory/ledger', <StockLedger />, ['stock.view'])}
          {r('/inventory/adjustments', <StockAdjustment />, ['stock.adjust'])}
          {r('/inventory/transfers', <StockTransfer />, ['stock.transfer'])}
          {r('/customers', <Customers />, ['customer.view'])}
          {r('/customers/loyalty', <Loyalty />, ['customer.view'])}
          {r('/customers/:id', <CustomerProfile />, ['customer.view'])}
          {r('/reports/:group', <Reports />, ['reports.view', 'reports.financial'])}
          {r('/accounts/cash', <Cash />, ['cash.manage'])}
          {r('/accounts/payments', <Payments />, ['payment.view', 'payment.create'])}
          {r('/accounts/expenses', <Expenses />, ['expense.view'])}
          {r('/admin/company', <Company />, ['branch.edit'])}
          {r('/admin/branches', <Masters kind="branches" />, ['branch.create', 'branch.edit'])}
          {r('/admin/users', <Users />, ['user.view'])}
          {r('/admin/roles', <Roles />, ['role.view'])}
          {r('/admin/permissions', <Roles matrix />, ['role.view'])}
          {r('/admin/settings', <SettingsPage />, ['settings.edit'])}
          {r('/admin/audit', <AuditLogs />, ['audit.view'])}
          {r('/admin/backup', <Backup />, ['backup.manage'])}
          {r('/admin/expense-categories', <Masters kind="expenseCategories" />, ['expense.view'])}
          <Route path="*" element={<Empty title="Page not found" />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
