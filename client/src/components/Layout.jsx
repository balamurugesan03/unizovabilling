import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  LayoutDashboard, ShoppingCart, Package, Truck, Warehouse, Users, BarChart3, Wallet, Settings, ChevronDown, Moon, Sun,
  LogOut, Menu, X, Store, KeyRound, Building2,
} from 'lucide-react';
import { useAuth } from '../store/auth';
import { useHotkeys } from '../hooks';
import { useUI } from '../store/ui';
import { connectSocket, disconnectSocket, joinBranch } from '../lib/socket';
import { post, errMsg } from '../lib/api';
import { ConfirmHost, Modal, Input } from './ui';

export const NAV = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/', perm: ['dashboard.view'] },
  {
    label: 'Sales', icon: ShoppingCart, children: [
      { label: 'POS Billing', to: '/pos', perm: ['sale.create'] },
      { label: 'Hold Bills', to: '/sales/hold', perm: ['sale.create'] },
      { label: 'Sales History', to: '/sales', perm: ['sale.view'] },
      { label: 'Sales Return', to: '/sales/return', perm: ['sale.return'] },
      { label: 'Exchange', to: '/sales/exchange', perm: ['sale.exchange'] },
    ],
  },
  {
    label: 'Products', icon: Package, children: [
      { label: 'Products', to: '/products', perm: ['product.view'] },
      { label: 'Categories', to: '/products/categories', perm: ['product.view'] },
      { label: 'Brands', to: '/products/brands', perm: ['product.view'] },
      { label: 'Variants', to: '/products/variants', perm: ['product.view'] },
      { label: 'Barcode Generator', to: '/products/barcodes', perm: ['barcode.print'] },
      { label: 'Barcode Printing', to: '/products/labels', perm: ['barcode.print'] },
    ],
  },
  {
    label: 'Purchase', icon: Truck, children: [
      { label: 'Purchase Entry', to: '/purchase/new', perm: ['purchase.create'] },
      { label: 'Purchase History', to: '/purchase', perm: ['purchase.view', 'purchase.create', 'purchase.edit'] },
      { label: 'Purchase Return', to: '/purchase/returns', perm: ['purchase.return'] },
      { label: 'Suppliers', to: '/purchase/suppliers', perm: ['supplier.view', 'purchase.view'] },
    ],
  },
  {
    label: 'Inventory', icon: Warehouse, children: [
      { label: 'Current Stock', to: '/inventory', perm: ['stock.view'] },
      { label: 'Stock Ledger', to: '/inventory/ledger', perm: ['stock.view'] },
      { label: 'Stock Adjustment', to: '/inventory/adjustments', perm: ['stock.adjust'] },
      { label: 'Stock Transfer', to: '/inventory/transfers', perm: ['stock.transfer'] },
    ],
  },
  {
    label: 'Customers', icon: Users, children: [
      { label: 'Customer List', to: '/customers', perm: ['customer.view'] },
      { label: 'Loyalty', to: '/customers/loyalty', perm: ['customer.view'] },
    ],
  },
  {
    label: 'Reports', icon: BarChart3, children: [
      { label: 'Sales', to: '/reports/Sales', perm: ['reports.view'] },
      { label: 'Purchase', to: '/reports/Purchase', perm: ['reports.view'] },
      { label: 'Stock', to: '/reports/Inventory', perm: ['reports.view'] },
      { label: 'Sales Statement', to: '/reports/Financial?r=sales_statement', perm: ['reports.financial'] },
      { label: 'GST', to: '/reports/Financial?r=gst_report', perm: ['reports.financial'] },
      { label: 'Profit / Loss', to: '/reports/Financial?r=profit_loss', perm: ['reports.financial'] },
      { label: 'Cash', to: '/reports/Financial?r=cash_book', perm: ['reports.financial'] },
      { label: 'Customers', to: '/reports/Customers', perm: ['reports.view'] },
    ],
  },
  {
    label: 'Accounts', icon: Wallet, children: [
      { label: 'Cash', to: '/accounts/cash', perm: ['cash.manage'] },
      { label: 'Payments', to: '/accounts/payments', perm: ['payment.view', 'payment.create'] },
      { label: 'Expenses', to: '/accounts/expenses', perm: ['expense.view'] },
      { label: 'Expense Categories', to: '/admin/expense-categories', perm: ['expense.view'] },
    ],
  },
  {
    label: 'Administration', icon: Settings, children: [
      { label: 'Company', to: '/admin/company', perm: ['branch.edit'] },
      { label: 'Branches', to: '/admin/branches', perm: ['branch.create', 'branch.edit'] },
      { label: 'Users', to: '/admin/users', perm: ['user.view'] },
      { label: 'Roles', to: '/admin/roles', perm: ['role.view'] },
      { label: 'Permissions', to: '/admin/permissions', perm: ['role.view'] },
      { label: 'Settings', to: '/admin/settings', perm: ['settings.edit'] },
      { label: 'Audit Logs', to: '/admin/audit', perm: ['audit.view'] },
      { label: 'Backup', to: '/admin/backup', perm: ['backup.manage'] },
    ],
  },
];

const pathOf = (to) => to.split('?')[0];
const groupActive = (children, location) => children.some((c) => location.pathname === pathOf(c.to) || (c.to !== '/' && location.pathname.startsWith(`${pathOf(c.to)}/`)));
function childActive(c, children, location) {
  const [path, query] = c.to.split('?');
  return location.pathname === path && (query ? location.search === `?${query}` : !children.some((o) => o.to.startsWith(`${path}?`) && location.search === `?${o.to.split('?')[1]}`));
}

function NavGroup({ item, can, open, onToggle }) {
  const location = useLocation();
  const children = item.children.filter((c) => can(...c.perm));
  if (!children.length) return null;
  const active = groupActive(children, location);
  const Icon = item.icon;
  return (
    <div className="relative">
      <button type="button" onClick={onToggle} aria-expanded={open} className={clsx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition', active ? 'bg-brand-600 text-white' : 'text-ink-300 hover:bg-white/5 hover:text-white', open && !active && 'bg-white/5 text-white')}>
        <Icon className="hidden h-4 w-4 shrink-0 xl:block" />{item.label}<ChevronDown className={clsx('h-3.5 w-3.5 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-1.5 min-w-[200px] rounded-xl border border-ink-200 bg-white p-1.5 shadow-xl dark:border-ink-700 dark:bg-ink-900">
          {children.map((c) => (
            <NavLink key={c.to} to={c.to} className={clsx('block rounded-md px-2.5 py-2 text-sm transition', childActive(c, children, location) ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800')}>
              {c.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileNav({ can }) {
  const location = useLocation();
  return (
    <nav className="max-h-[70vh] space-y-3 overflow-y-auto border-t border-white/10 px-4 py-3 lg:hidden">
      {NAV.map((item) => {
        if (!item.children) {
          return can(...item.perm) && (
            <NavLink key={item.to} to={item.to} end className={({ isActive }) => clsx('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-brand-600 text-white' : 'text-ink-300 hover:bg-white/5')}>
              <item.icon className="h-4 w-4" />{item.label}
            </NavLink>
          );
        }
        const children = item.children.filter((c) => can(...c.perm));
        if (!children.length) return null;
        return (
          <div key={item.label}>
            <div className="mb-1 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-500"><item.icon className="h-3.5 w-3.5" />{item.label}</div>
            <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-3">
              {children.map((c) => (
                <NavLink key={c.to} to={c.to} className={clsx('rounded-md px-3 py-1.5 text-[13px]', childActive(c, children, location) ? 'bg-brand-600 font-medium text-white' : 'text-ink-300 hover:bg-white/5 hover:text-white')}>{c.label}</NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function ChangePassword({ open, onClose }) {
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const logout = useAuth((s) => s.logout);
  const submit = async (e) => {
    e.preventDefault();
    if (f.newPassword !== f.confirm) return toast.error('Passwords do not match');
    try {
      await post('/auth/change-password', { currentPassword: f.currentPassword, newPassword: f.newPassword });
      toast.success('Password changed. Please login again.');
      await logout();
    } catch (err) { toast.error(errMsg(err)); }
    return null;
  };
  return (
    <Modal open={open} onClose={onClose} title="Change Password" size="sm">
      <form onSubmit={submit} className="space-y-3">
        <Input label="Current password" type="password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} required />
        <Input label="New password" type="password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} required minLength={6} />
        <Input label="Confirm new password" type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required />
        <div className="flex justify-end gap-2 pt-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary">Change password</button></div>
      </form>
    </Modal>
  );
}

export default function Layout() {
  const { user, company, branches, branchId, setBranch, logout, can, accessToken } = useAuth();
  const { theme, toggleTheme } = useUI();
  const [openGroup, setOpenGroup] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const navRef = useRef(null);
  const [menu, setMenu] = useState(false);
  const [pwd, setPwd] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isPOS = location.pathname === '/pos';

  useEffect(() => {
    if (accessToken) connectSocket(accessToken, branchId);
    return () => disconnectSocket();
    // reconnect only on login (token refreshes keep the socket)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);
  useEffect(() => { joinBranch(branchId); }, [branchId]);

  // app-wide function keys (passed on to the popup while one is open, e.g. F10 = full cash in payment):
  // F1 sales (new bill) · F2 sales return · F4 purchase entry · F5 new product · F6 reports
  // F7 sales summary (product-wise) · F8 purchase summary · F9 cash payment (supplier) · F10 cash receipt (customer)
  // F11 GST billing (GPay / card bills) · F12 GST report (tax-wise)
  // (F3 = direct print of the last bill, handled inside POS).
  // With restart, a fresh state value tells the page to start over even when it is already open;
  // without it nothing happens if that page is already open, so a half-filled form is not lost.
  const goTo = (path, perms, { restart = false, state } = {}) => () => {
    if (document.querySelector('[role="dialog"]')) return false;
    if (!perms || !can(...[].concat(perms))) { toast.error('You do not have access to this page'); return undefined; }
    if (!restart && `${location.pathname}${location.search}` === path) return undefined;
    navigate(path, restart ? { state: { ...state, fresh: Date.now() } } : undefined);
    return undefined;
  };
  // pick the first report the user is allowed to see
  const report = (...options) => {
    const hit = options.find(([, perm]) => can(perm));
    return hit ? goTo(hit[0], hit[1]) : goTo('/', null);
  };
  useHotkeys({
    F1: goTo('/pos', 'sale.create', { restart: true }),
    // F2: sales return popup on the billing page (returned items join the current bill as minus lines)
    F2: () => {
      if (document.querySelector('[role="dialog"]')) return false;
      if (!can('sale.create') || !can('sale.return')) { toast.error('You do not have access to sales return'); return undefined; }
      navigate('/pos', { state: { openReturn: Date.now() } });
      return undefined;
    },
    F4: goTo('/purchase/new', 'purchase.create'),
    F5: goTo('/products/new', 'product.create'),
    F6: report(['/reports/Sales', 'reports.view'], ['/reports/Financial?r=sales_statement', 'reports.financial']),
    F7: report(['/reports/Financial?r=sales_summary_product', 'reports.financial'], ['/reports/Sales?r=sales_product', 'reports.view']),
    F8: report(['/reports/Financial?r=fin_purchase', 'reports.financial'], ['/reports/Purchase?r=purchase_datewise', 'reports.view']),
    F9: goTo('/accounts/payments', 'payment.create', { restart: true, state: { open: 'supplier', mode: 'cash' } }),
    F10: goTo('/accounts/payments', 'payment.create', { restart: true, state: { open: 'customer', mode: 'cash' } }),
    F11: goTo('/reports/Financial?r=gst_billing', 'reports.financial'), // GST billing: GPay / card bills
    F12: goTo('/reports/Financial?r=gst_taxwise', 'reports.financial'), // GST report, each tax rate separately
  });

  // close menus on navigation, outside click and Escape
  useEffect(() => { setOpenGroup(null); setMobileNav(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!openGroup) return undefined;
    const onDown = (e) => { if (!navRef.current?.contains(e.target)) setOpenGroup(null); };
    const onKey = (e) => { if (e.key === 'Escape') setOpenGroup(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [openGroup]);

  return (
    <div className="flex h-full flex-col">
      <div className="relative z-30 shrink-0 bg-ink-900 dark:bg-ink-950 dark:ring-1 dark:ring-ink-800">
        <header className="flex h-14 items-center gap-3 px-4">
          <button type="button" className="rounded-lg p-2 text-ink-300 hover:bg-white/5 hover:text-white lg:hidden" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle menu">{mobileNav ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          <NavLink to="/" className="flex shrink-0 items-center" title={company?.name || 'Unizova'}>
            <img src="/unilogo-dark.png" alt="Unizova Technologies" className="h-7 w-auto" />
          </NavLink>
          <div className="ml-2 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 py-1 pl-2.5 pr-1 text-white">
            <Store className="h-4 w-4 text-brand-400" />
            <select className="bg-transparent py-0.5 pr-1 text-sm font-medium outline-none [&>option]:text-ink-900" value={branchId || ''} onChange={(e) => { setBranch(e.target.value); toast.success(`Switched to ${e.target.value === 'all' ? 'All Branches' : branches.find((b) => b._id === e.target.value)?.name}`); }}>
              {user?.role?.allBranches && <option value="all">All Branches</option>}
              {branches.map((b) => <option key={b._id} value={b._id}>{b.name}{b.type === 'main' ? ' (Main)' : ''}</option>)}
            </select>
          </div>
          {can('sale.create') && <button type="button" className={clsx('btn-primary shrink-0', isPOS && 'ring-2 ring-white/40')} onClick={() => navigate('/pos')} title="POS Billing (F1 = new bill)"><ShoppingCart className="h-4 w-4" /> <span className="hidden sm:inline">POS Billing</span></button>}
          {branchId === 'all' && <span className="badge-amber hidden sm:inline-flex">Consolidated view</span>}
          <div className="flex-1" />
          <button type="button" className="rounded-lg p-2 text-ink-300 hover:bg-white/5 hover:text-white" onClick={toggleTheme} aria-label="Toggle theme">{theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
          <div className="relative">
            <button type="button" className="flex items-center gap-2 rounded-lg px-2 py-1 text-white hover:bg-white/5" onClick={() => setMenu(!menu)}>
              <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">{user?.name?.[0]}</div>
              <div className="hidden text-left md:block"><div className="text-sm font-semibold leading-tight">{user?.name}</div><div className="text-[11px] text-ink-400">{user?.role?.name}</div></div>
              <ChevronDown className="h-4 w-4 text-ink-400" />
            </button>
            {menu && (
              <div className="absolute right-0 z-40 mt-1 w-52 rounded-xl border border-ink-200 bg-white p-1.5 shadow-xl dark:border-ink-700 dark:bg-ink-900" onMouseLeave={() => setMenu(false)}>
                <div className="px-2.5 py-2 text-xs text-ink-500"><Building2 className="mr-1 inline h-3.5 w-3.5" />{company?.name}</div>
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-ink-50 dark:hover:bg-ink-800" onClick={() => { setMenu(false); setPwd(true); }}><KeyRound className="h-4 w-4" /> Change password</button>
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10" onClick={async () => { await logout(); navigate('/login'); }}><LogOut className="h-4 w-4" /> Logout</button>
              </div>
            )}
          </div>
        </header>
        <nav ref={navRef} className="hidden h-11 items-center gap-1 border-t border-white/10 px-3 lg:flex">
          {NAV.map((item) => (item.children
            ? <NavGroup key={item.label} item={item} can={can} open={openGroup === item.label} onToggle={() => setOpenGroup(openGroup === item.label ? null : item.label)} />
            : can(...item.perm) && (
              <NavLink key={item.to} to={item.to} end className={({ isActive }) => clsx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition', isActive ? 'bg-brand-600 text-white' : 'text-ink-300 hover:bg-white/5 hover:text-white')}>
                <item.icon className="hidden h-4 w-4 shrink-0 xl:block" />{item.label}
              </NavLink>
            )))}
        </nav>
        {mobileNav && <MobileNav can={can} />}
      </div>
      <main className={clsx('min-h-0 flex-1 overflow-y-auto', isPOS ? 'p-0' : 'p-4 sm:p-6')}>
        {/* re-mount the page on a branch switch so it reloads that branch's data */}
        <Outlet key={branchId || 'none'} />
      </main>
      <ConfirmHost />
      <ChangePassword open={pwd} onClose={() => setPwd(false)} />
    </div>
  );
}
