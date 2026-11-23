import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LogIn, ScanBarcode, Store, BarChart3 } from 'lucide-react';
import { useAuth } from '../store/auth';
import { errMsg } from '../lib/api';

const DEMO = [
  ['admin', 'admin123', 'Super Admin'], ['manager', 'manager123', 'Branch Manager'], ['cashier', 'cashier123', 'Cashier'],
  ['stock', 'stock123', 'Stock Manager'], ['accountant', 'accounts123', 'Accountant'],
];

export default function Login() {
  const login = useAuth((s) => s.login);
  const [f, setF] = useState({ username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(f.username, f.password);
      // Billing staff land on POS straight after login; others fall back to the home page.
      navigate(useAuth.getState().can('sale.create') ? '/pos' : '/', { replace: true });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-ink-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="relative"><img src="/unilogo-dark.png" alt="Unizova Technologies" className="h-12 w-auto" /></div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-extrabold leading-tight">Billing, barcodes & inventory for every branch.</h1>
          <p className="mt-4 text-ink-300">Scan-fast POS, size/colour variants, GST invoices, returns & exchanges, branch transfers and real-time reports.</p>
          <div className="mt-8 grid grid-cols-3 gap-3 text-sm">
            {[[ScanBarcode, 'Barcode billing'], [Store, 'Multi-branch'], [BarChart3, 'Live reports']].map(([I, t]) => (
              <div key={t} className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10"><I className="mb-2 h-5 w-5 text-brand-300" />{t}</div>
            ))}
          </div>
        </div>
        <div className="relative text-xs text-ink-500">© {new Date().getFullYear()} Unizova Technologies</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><div className="inline-flex rounded-xl bg-ink-900 px-4 py-2.5"><img src="/unilogo-dark.png" alt="Unizova Technologies" className="h-7 w-auto" /></div></div>
          <h2 className="text-2xl font-bold text-ink-900 dark:text-white">Sign in</h2>
          <p className="mt-1 text-sm text-ink-500">Use your store account to continue.</p>
          <div className="mt-6 space-y-4">
            <div><label className="label" htmlFor="u">Username</label><input id="u" className="input py-2.5" autoFocus autoComplete="username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required /></div>
            <div><label className="label" htmlFor="p">Password</label><input id="p" type="password" className="input py-2.5" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></div>
            <button className="btn-primary w-full py-2.5" disabled={busy}><LogIn className="h-4 w-4" /> {busy ? 'Signing in…' : 'Sign in'}</button>
          </div>
          <div className="mt-8 rounded-xl border border-dashed border-ink-300 p-3 dark:border-ink-700">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Demo accounts</div>
            <div className="flex flex-wrap gap-1.5">
              {DEMO.map(([u, p, r]) => (
                <button type="button" key={u} className="btn-secondary btn-sm" onClick={() => setF({ username: u, password: p })}>{r}</button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
