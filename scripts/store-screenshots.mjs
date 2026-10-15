// Gera capturas de tela para a Play Store com o app real (build em www/) e dados de exemplo.
// Nada vai para o Supabase: sessão falsa no localStorage e respostas da API interceptadas.
// Uso: npm run build && node scripts/store-screenshots.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const OUT = 'assets/store-screenshots';
const PORT = 4321;
const env = readFileSync('src/environments/env.generated.ts', 'utf8');
const SUPABASE_URL = env.match(/"SUPABASE_URL": "([^"]+)"/)[1];
const REF = new URL(SUPABASE_URL).hostname.split('.')[0];

// ---------------------------------------------------------------- dados de exemplo
const HH = '11111111-1111-4111-8111-111111111111';
const ME = '22222222-2222-4222-8222-222222222222';

function price(principal, rate, n) {
  const pmt = Math.round((principal * rate) / (1 - Math.pow(1 + rate, -n)));
  let bal = principal;
  return Array.from({ length: n }, (_, k) => {
    const interest = Math.round(bal * rate);
    const amort = k === n - 1 ? bal : pmt - interest;
    bal -= amort;
    return { n: k + 1, payment_cents: interest + amort, interest_cents: interest, amortization_cents: amort };
  });
}

function addMonths(iso, m) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + m);
  return d.toISOString().slice(0, 10);
}

const today = new Date();
const thisMonth = (day) => `${today.toISOString().slice(0, 7)}-${String(day).padStart(2, '0')}`;

const specs = [
  { id: 'd-cartao', name: 'Rotativo do cartão', icon: 'card-outline', principal: 180000, rate: 0.129, n: 6, paid: 2, first: addMonths(thisMonth(17), -2) },
  { id: 'd-carro', name: 'Financiamento do carro', icon: 'car-outline', principal: 3800000, rate: 0.021, n: 48, paid: 14, first: addMonths(thisMonth(20), -14) },
  { id: 'd-consig', name: 'Consignado', icon: 'cash-outline', principal: 600000, rate: 0.016, n: 24, paid: 8, first: addMonths(thisMonth(10), -7) },
];

const debts = [];
const installments = [];
for (const s of specs) {
  const rows = price(s.principal, s.rate, s.n);
  const paidAmort = rows.slice(0, s.paid).reduce((a, r) => a + r.amortization_cents, 0);
  debts.push({
    id: s.id, household_id: HH, owner_id: ME, private: false, name: s.name, creditor: 'Banco', icon: s.icon,
    principal_cents: s.principal, balance_cents: s.principal - paidAmort, monthly_rate: s.rate, system: 'price',
    installments: s.n, first_due: s.first,
  });
  for (const r of rows) {
    installments.push({
      ...r, id: `${s.id}-${r.n}`, debt_id: s.id, due_date: addMonths(s.first, r.n - 1),
      paid_at: r.n <= s.paid ? '2026-01-01T00:00:00Z' : null,
    });
  }
}

const members = [
  { user_id: ME, role: 'owner', joined_at: '2026-10-01T00:00:00Z', email: 'voce@exemplo.com' },
  { user_id: '33333333-3333-4333-8333-333333333333', role: 'editor', joined_at: '2026-10-02T00:00:00Z', email: 'ana@exemplo.com' },
];

function rest(url) {
  const u = new URL(url);
  const table = u.pathname.split('/').pop();
  const q = u.searchParams;
  if (table === 'household_members' && q.get('select')?.includes('households')) return [{ role: 'owner', households: { id: HH, name: 'Casa' } }];
  if (table === 'household_members') return members;
  if (table === 'debts') return [...debts].sort((a, b) => b.monthly_rate - a.monthly_rate);
  if (table === 'installments') {
    let rows = installments;
    const debtEq = q.get('debt_id');
    if (debtEq?.startsWith('eq.')) rows = rows.filter((r) => r.debt_id === debtEq.slice(3));
    if (q.get('paid_at') === 'is.null') rows = rows.filter((r) => !r.paid_at);
    if (q.get('order')?.startsWith('due_date')) rows = [...rows].sort((a, b) => a.due_date.localeCompare(b.due_date));
    if (q.get('limit')) rows = rows.slice(0, Number(q.get('limit')));
    if (q.get('select') === 'debt_id') rows = rows.map((r) => ({ debt_id: r.debt_id }));
    return rows;
  }
  return [];
}

// ---------------------------------------------------------------- execução
const server = spawn('npx', ['serve', '-s', 'www', '-l', String(PORT)], { shell: true, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 3000));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' }) // Chrome instalado, perfil temporário;
const ctx = await browser.newContext({
  viewport: { width: 360, height: 640 },
  deviceScaleFactor: 3, // 1080 x 1920 (9:16)
  colorScheme: 'dark',
  locale: 'pt-BR',
});

const session = {
  access_token: 'demo', refresh_token: 'demo', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: ME, email: 'voce@exemplo.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
};
await ctx.addInitScript(([key, value]) => localStorage.setItem(key, value), [`sb-${REF}-auth-token`, JSON.stringify(session)]);

await ctx.route(`${SUPABASE_URL}/**`, async (route) => {
  const url = route.request().url();
  if (url.includes('/auth/v1/user')) return route.fulfill({ json: session.user });
  if (url.includes('/rest/v1/')) return route.fulfill({ json: rest(url) });
  return route.fulfill({ json: {} });
});

const page = await ctx.newPage();
const shots = [
  ['01-inicio', '/inicio'],
  ['02-dividas', '/dividas'],
  ['03-amortizar', '/dividas/d-carro'],
  ['04-nova-divida', '/dividas/nova'],
  ['05-lar', '/lar'],
];
for (const [name, path] of shots) {
  await page.goto(`http://localhost:${PORT}${path}`);
  await page.waitForTimeout(1800);
  if (name === '04-nova-divida') {
    await page.fill('#d-name', 'Financiamento do carro');
    await page.fill('#d-cred', 'Banco');
    await page.fill('#d-val', '38.000,00');
    await page.fill('#d-rate', '2,1');
    await page.fill('#d-n', '48');
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('ok', name);
}

await browser.close();
server.kill();
process.exit(0);
