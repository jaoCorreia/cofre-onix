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

/**
 * Lê um objeto JSON vindo de um modelo de IA, tolerando blocos ```json, texto antes/depois
 * e espaços. Devolve null se não houver um objeto válido.
 */
export function parseJsonObject(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(cleaned.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

// Prioridade: 1) datas de vencimento e sistema de amortização; 2) demais termos decisivos;
// 3) termos frequentes ("parcela", "taxa"), só se sobrar espaço.
const TOP = /vencimento[^\n]{0,40}?\d{2}\/\d{2}\/\d{4}|\bprice\b|\bsac\b|sistema de amortiza|primeir[oa] (?:parcela|vencimento)/gi;
const STRONG = /vencimento|\bprice\b|\bsac\b|sistema de amortiza|\bcet\b|custo efetivo|valor (?:total|liberado|financiado|do empr[eé]stimo)|quantidade de parcelas|prazo/gi;
const WEAK = /parcela|presta[cç][aã]o|taxa|juros/gi;

/**
 * Recorte do texto enviado à IA: o começo do documento (onde fica o resumo) mais trechos
 * ao redor de palavras-chave no resto. Contratos longos trazem prazos e sistema de
 * amortização só nas páginas finais.
 */
export function excerptForExtraction(text: string, maxChars = 12_000, headChars = 6_000, window = 180): string {
  const clean = text.replace(/[ \t]+/g, ' ');
  if (clean.length <= maxChars) return clean;
  const head = clean.slice(0, headChars);
  const rest = clean.slice(headChars);
  const picked: [number, number][] = [];
  let budget = maxChars - head.length;

  const overlaps = (s: number, e: number) => picked.some(([a, b]) => s < b && e > a);
  for (const re of [TOP, STRONG, WEAK]) {
    for (const m of rest.matchAll(re)) {
      const at = headChars + (m.index ?? 0);
      const s = Math.max(headChars, at - window);
      const e = Math.min(clean.length, at + window);
      if (overlaps(s, e)) continue;
      const cost = e - s + SEP.length;
      if (cost > budget) continue;
      picked.push([s, e]);
      budget -= cost;
    }
  }
  picked.sort((a, b) => a[0] - b[0]);
  return head + picked.map(([s, e]) => SEP + clean.slice(s, e)).join('');
}

const SEP = '\n[...]\n';
