/**
 * Validação do que a IA devolve. Nada aqui executa código arbitrário:
 * gráficos são dados validados e fórmulas passam por um avaliador próprio
 * (só números, variáveis conhecidas, + - * / ^, parênteses e min/max/abs/round).
 */

// ---------------------------------------------------------------- gráficos
export type ChartKind = 'bar' | 'line' | 'pie';

export interface ChartSpec {
  kind: ChartKind;
  title: string;
  labels: string[];
  series: { name: string; values: number[] }[];
  /** Como formatar os valores: dinheiro em reais, percentual ou número. */
  unit: 'brl' | 'percent' | 'number';
}

const MAX_POINTS = 60;
const MAX_SERIES = 4;

export function validateChart(input: unknown): { ok: true; chart: ChartSpec } | { ok: false; error: string } {
  const c = input as Partial<ChartSpec>;
  if (!c || typeof c !== 'object') return { ok: false, error: 'gráfico vazio' };
  if (!['bar', 'line', 'pie'].includes(c.kind as string)) return { ok: false, error: 'tipo deve ser bar, line ou pie' };
  if (typeof c.title !== 'string' || !c.title.trim() || c.title.length > 80) return { ok: false, error: 'título inválido' };
  if (!Array.isArray(c.labels) || c.labels.length === 0 || c.labels.length > MAX_POINTS) return { ok: false, error: `de 1 a ${MAX_POINTS} rótulos` };
  if (!c.labels.every((l) => typeof l === 'string' && l.length <= 40)) return { ok: false, error: 'rótulos devem ser textos curtos' };
  if (!Array.isArray(c.series) || c.series.length === 0 || c.series.length > MAX_SERIES) return { ok: false, error: `de 1 a ${MAX_SERIES} séries` };
  if (c.kind === 'pie' && c.series.length !== 1) return { ok: false, error: 'pizza aceita uma série' };
  for (const s of c.series) {
    if (!s || typeof s.name !== 'string' || s.name.length > 40) return { ok: false, error: 'nome de série inválido' };
    if (!Array.isArray(s.values) || s.values.length !== c.labels.length) return { ok: false, error: 'cada série precisa de um valor por rótulo' };
    if (!s.values.every((v) => typeof v === 'number' && Number.isFinite(v))) return { ok: false, error: 'valores devem ser números' };
    if (c.kind === 'pie' && s.values.some((v) => v < 0)) return { ok: false, error: 'pizza não aceita valores negativos' };
  }
  const unit = c.unit ?? 'number';
  if (!['brl', 'percent', 'number'].includes(unit)) return { ok: false, error: 'unidade inválida' };
  return {
    ok: true,
    chart: {
      kind: c.kind as ChartKind,
      title: c.title.trim(),
      labels: [...c.labels],
      series: c.series.map((s) => ({ name: s.name, values: [...s.values] })),
      unit,
    },
  };
}

// ---------------------------------------------------------------- fórmulas
type Tok = { t: 'num'; v: number } | { t: 'var'; v: string } | { t: 'op'; v: string } | { t: 'fn'; v: string } | { t: '('; } | { t: ')' } | { t: ',' };

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  abs: (a) => Math.abs(a),
  round: (a, d = 0) => Math.round(a * 10 ** d) / 10 ** d,
};
const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3, neg: 4 };
const MAX_FORMULA = 200;

function tokenize(expr: string): Tok[] {
  if (expr.length > MAX_FORMULA) throw new Error('fórmula longa demais');
  const out: Tok[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    const num = /^\d+(?:[.,]\d+)?/.exec(expr.slice(i));
    if (num) { out.push({ t: 'num', v: Number(num[0].replace(',', '.')) }); i += num[0].length; continue; }
    const id = /^[a-z_][a-z0-9_]*/i.exec(expr.slice(i));
    if (id) {
      const name = id[0].toLowerCase();
      out.push(name in FUNCTIONS ? { t: 'fn', v: name } : { t: 'var', v: name });
      i += id[0].length;
      continue;
    }
    if ('+-*/^'.includes(ch)) { out.push({ t: 'op', v: ch }); i++; continue; }
    if (ch === '(') { out.push({ t: '(' }); i++; continue; }
    if (ch === ')') { out.push({ t: ')' }); i++; continue; }
    if (ch === ';') { out.push({ t: ',' }); i++; continue; }
    throw new Error(`caractere não permitido: "${ch}"`);
  }
  return out;
}

/** Converte para notação polonesa reversa (shunting-yard), checando a estrutura. */
type RpnItem = Tok | { t: 'neg' } | { t: 'call'; v: string; argc: number };

function toRpn(tokens: Tok[]): RpnItem[] {
  const out: RpnItem[] = [];
  const stack: (Tok | { t: 'neg' })[] = [];
  const argc: number[] = [];
  let prev: Tok | null = null;
  for (const tok of tokens) {
    const expectOperand = !prev || prev.t === 'op' || prev.t === '(' || prev.t === ',';
    switch (tok.t) {
      case 'num':
      case 'var':
        if (!expectOperand) throw new Error('falta um operador');
        out.push(tok);
        break;
      case 'fn':
        if (!expectOperand) throw new Error('falta um operador');
        stack.push(tok);
        break;
      case 'op': {
        if (expectOperand) {
          if (tok.v === '-') { stack.push({ t: 'neg' }); prev = tok; continue; }
          if (tok.v === '+') { prev = tok; continue; }
          throw new Error(`operador "${tok.v}" fora de lugar`);
        }
        const p = PREC[tok.v];
        while (stack.length) {
          const top = stack[stack.length - 1];
          const tp = top.t === 'neg' ? PREC['neg'] : top.t === 'op' ? PREC[top.v] : -1;
          if (tp > p || (tp === p && tok.v !== '^')) out.push(stack.pop() as Tok);
          else break;
        }
        stack.push(tok);
        break;
      }
      case '(':
        if (!expectOperand && prev?.t !== 'fn') throw new Error('falta um operador antes de "("');
        if (prev?.t === 'fn') argc.push(1);
        stack.push(tok);
        break;
      case ',': {
        while (stack.length && stack[stack.length - 1].t !== '(') out.push(stack.pop() as Tok);
        if (!argc.length) throw new Error('";" só dentro de funções');
        argc[argc.length - 1]++;
        break;
      }
      case ')': {
        while (stack.length && stack[stack.length - 1].t !== '(') out.push(stack.pop() as Tok);
        if (!stack.length) throw new Error('parênteses desbalanceados');
        stack.pop();
        const fn = stack[stack.length - 1];
        if (fn?.t === 'fn') { stack.pop(); out.push({ t: 'call', v: fn.v, argc: argc.pop() ?? 1 }); }
        break;
      }
    }
    prev = tok;
  }
  while (stack.length) {
    const top = stack.pop()!;
    if (top.t === '(') throw new Error('parênteses desbalanceados');
    out.push(top as Tok);
  }
  return out;
}

export interface Formula {
  name: string;
  expression: string;
  variables: string[];
}

/** Valida a fórmula e lista as variáveis usadas, que precisam estar entre as permitidas. */
export function validateFormula(expression: string, allowed: string[]): { ok: true; variables: string[] } | { ok: false; error: string } {
  try {
    const rpn = toRpn(tokenize(expression));
    if (rpn.length === 0) return { ok: false, error: 'fórmula vazia' };
    const vars = [...new Set(rpn.filter((t): t is { t: 'var'; v: string } => t.t === 'var').map((t) => t.v))];
    const unknown = vars.filter((v) => !allowed.includes(v));
    if (unknown.length) return { ok: false, error: `variável desconhecida: ${unknown.join(', ')}` };
    evaluateFormula(expression, Object.fromEntries(allowed.map((v) => [v, 1]))); // checa a aridade
    return { ok: true, variables: vars };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function evaluateFormula(expression: string, scope: Record<string, number>): number {
  const stack: number[] = [];
  for (const t of toRpn(tokenize(expression))) {
    if (t.t === 'num') stack.push(t.v);
    else if (t.t === 'var') {
      if (!(t.v in scope)) throw new Error(`variável sem valor: ${t.v}`);
      stack.push(scope[t.v]);
    } else if (t.t === 'neg') {
      if (!stack.length) throw new Error('expressão incompleta');
      stack.push(-stack.pop()!);
    } else if (t.t === 'op') {
      if (stack.length < 2) throw new Error('expressão incompleta');
      const b = stack.pop()!, a = stack.pop()!;
      stack.push(t.v === '+' ? a + b : t.v === '-' ? a - b : t.v === '*' ? a * b : t.v === '/' ? a / b : a ** b);
    } else if (t.t === 'call') {
      if (stack.length < t.argc) throw new Error('argumentos faltando');
      const args = stack.splice(stack.length - t.argc, t.argc);
      stack.push(FUNCTIONS[t.v](...args));
    }
  }
  if (stack.length !== 1) throw new Error('expressão incompleta');
  const r = stack[0];
  if (!Number.isFinite(r)) throw new Error('resultado inválido (divisão por zero?)');
  return r;
}

/** Variáveis que o app sabe calcular a partir dos dados do lar. */
export const FORMULA_VARIABLES = {
  divida_total: 'Soma dos saldos devedores (R$)',
  parcelas_mes: 'Soma das parcelas que vencem no mês (R$)',
  juros_restantes: 'Juros que ainda serão pagos em todas as dívidas (R$)',
  maior_taxa: 'Maior taxa de juros ao mês entre as dívidas (%)',
  qtd_dividas: 'Número de dívidas em aberto',
  investido_total: 'Soma dos investimentos (R$)',
  reserva: 'Saldo da reserva de emergência (R$)',
  reserva_meses: 'Meses de gastos cobertos pela reserva',
  gastos_mensais: 'Gastos mensais do lar (R$)',
  te_devem: 'Quanto te devem em empréstimos (R$)',
  patrimonio: 'Patrimônio líquido (R$)',
  renda_mes: 'Renda recebida no mês (R$)',
  comprometimento: '% da renda regular comprometida com parcelas',
} as const;

export type FormulaScope = Record<keyof typeof FORMULA_VARIABLES, number>;
