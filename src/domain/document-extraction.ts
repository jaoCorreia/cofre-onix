/**
 * Dados que a IA extrai de uma fatura, boleto ou contrato. Tudo passa por esta
 * validação antes de aparecer na tela de revisão; nada é gravado sem o usuário confirmar.
 */
export type DocumentKind = 'invoice' | 'contract' | 'boleto' | 'other';

export interface ExtractedDocument {
  kind: DocumentKind;
  creditor: string | null;
  description: string | null;
  /** Valor total financiado (contrato) ou valor da fatura/boleto, em centavos. */
  amountCents: number | null;
  installments: number | null;
  /** Taxa ao mês (fração: 0,021 = 2,1%). */
  monthlyRate: number | null;
  system: 'price' | 'sac' | null;
  firstDue: string | null; // yyyy-mm-dd
  /** Campos em que a IA não teve certeza: a tela destaca para conferência. */
  uncertain: string[];
}

const FIELDS = ['creditor', 'description', 'amountCents', 'installments', 'monthlyRate', 'system', 'firstDue'] as const;
const MAX_AMOUNT = 100_000_000_00; // R$ 100 milhões

function isoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) {
    const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
    if (br) m = [v, br[3], br[2], br[1]] as unknown as RegExpExecArray;
  }
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(m[3]) ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Normaliza o JSON da IA. Valores fora de faixa viram null e entram em "uncertain". */
export function normalizeExtraction(raw: unknown): ExtractedDocument {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const uncertain = new Set<string>(Array.isArray(r['uncertain']) ? (r['uncertain'] as unknown[]).filter((x): x is string => typeof x === 'string') : []);

  const reais = typeof r['amount'] === 'number' ? r['amount'] : Number(String(r['amount'] ?? '').replace(/\./g, '').replace(',', '.'));
  let amountCents: number | null = Number.isFinite(reais) && reais > 0 ? Math.round(reais * 100) : null;
  if (amountCents !== null && amountCents > MAX_AMOUNT) amountCents = null;

  let installments: number | null = Number(r['installments']);
  if (!Number.isInteger(installments) || installments < 1 || installments > 600) installments = null;

  const rawPct = r['monthly_rate_percent'];
  const pct = typeof rawPct === 'number' ? rawPct : typeof rawPct === 'string' && rawPct.trim() ? Number(rawPct.replace(',', '.')) : NaN;
  const monthlyRate: number | null = Number.isFinite(pct) && pct >= 0 && pct <= 30 ? pct / 100 : null;

  const system = r['system'] === 'price' || r['system'] === 'sac' ? r['system'] : null;
  const kind: DocumentKind = ['invoice', 'contract', 'boleto', 'other'].includes(r['kind'] as string) ? (r['kind'] as DocumentKind) : 'other';

  const doc: ExtractedDocument = {
    kind,
    creditor: text(r['creditor'], 120),
    description: text(r['description'], 120),
    amountCents,
    installments,
    monthlyRate,
    system,
    firstDue: isoDate(r['first_due']),
    uncertain: [],
  };
  for (const f of FIELDS) if (doc[f] === null) uncertain.add(f);
  doc.uncertain = FIELDS.filter((f) => uncertain.has(f));
  return doc;
}

/** Hash SHA-256 (hex) do arquivo, para detectar o mesmo documento enviado duas vezes. */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
