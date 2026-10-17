/**
 * Catálogo de ícones para lançamentos (nomes do Ionicons) com palavras-chave em português.
 * A sugestão local funciona offline; a IA só é chamada quando nenhuma palavra bate.
 */
export const ICON_CATALOG: Record<string, string[]> = {
  'car-outline': ['carro', 'veiculo', 'veículo', 'auto', 'moto', 'financiamento de veiculo', 'ipva', 'combustivel', 'gasolina', 'uber'],
  'card-outline': ['cartao', 'cartão', 'fatura', 'rotativo', 'nubank', 'credito', 'crédito', 'visa', 'master'],
  'home-outline': ['casa', 'imovel', 'imóvel', 'apartamento', 'aluguel', 'condominio', 'condomínio', 'iptu', 'reforma'],
  'school-outline': ['faculdade', 'escola', 'curso', 'fies', 'estudo', 'mensalidade', 'educacao', 'educação'],
  'medkit-outline': ['saude', 'saúde', 'hospital', 'medico', 'médico', 'plano de saude', 'dentista', 'remedio', 'remédio', 'farmacia'],
  'phone-portrait-outline': ['celular', 'telefone', 'iphone', 'smartphone', 'plano movel'],
  'laptop-outline': ['notebook', 'computador', 'pc', 'laptop', 'macbook'],
  'tv-outline': ['tv', 'televisao', 'televisão', 'eletronico', 'eletrônico', 'streaming', 'netflix'],
  'cart-outline': ['mercado', 'supermercado', 'compras', 'loja', 'magazine', 'carne'],
  'cash-outline': ['emprestimo', 'empréstimo', 'consignado', 'pessoal', 'dinheiro', 'pix', 'cheque especial'],
  'briefcase-outline': ['salario', 'salário', 'trabalho', 'emprego', 'pagamento', 'holerite', 'clt'],
  'business-outline': ['banco', 'bradesco', 'itau', 'itaú', 'caixa', 'santander', 'inter', 'empresa', 'cnpj'],
  'airplane-outline': ['viagem', 'passagem', 'aviao', 'avião', 'hotel', 'ferias', 'férias'],
  'flash-outline': ['luz', 'energia', 'eletricidade', 'enel', 'cemig', 'copel'],
  'water-outline': ['agua', 'água', 'sabesp', 'saneamento'],
  'wifi-outline': ['internet', 'wifi', 'fibra', 'vivo', 'claro', 'tim', 'oi'],
  'shirt-outline': ['roupa', 'vestuario', 'vestuário', 'sapato', 'tenis', 'tênis'],
  'paw-outline': ['pet', 'cachorro', 'gato', 'veterinario', 'veterinário', 'racao', 'ração'],
  'fitness-outline': ['academia', 'esporte', 'gym', 'bike', 'bicicleta'],
  'restaurant-outline': ['restaurante', 'comida', 'ifood', 'lanche', 'delivery'],
  'gift-outline': ['presente', 'aniversario', 'aniversário', 'natal', 'casamento'],
  'construct-outline': ['ferramenta', 'obra', 'material de construcao', 'pedreiro', 'manutencao', 'manutenção'],
  'person-outline': ['amigo', 'amiga', 'irmao', 'irmão', 'mae', 'mãe', 'pai', 'primo', 'tio', 'vizinho', 'colega'],
  'people-outline': ['familia', 'família', 'parentes', 'grupo'],
  'trending-up-outline': ['acoes', 'ações', 'bolsa', 'fii', 'fundo', 'etf', 'cripto', 'bitcoin'],
  'shield-checkmark-outline': ['reserva', 'emergencia', 'emergência', 'seguro', 'seguranca', 'segurança'],
  'leaf-outline': ['tesouro', 'selic', 'ipca', 'cdb', 'lci', 'lca', 'poupanca', 'poupança', 'renda fixa'],
  'receipt-outline': ['boleto', 'conta', 'imposto', 'taxa', 'multa'],
};

export const ICON_NAMES = Object.keys(ICON_CATALOG);

/** Categorias genéricas só valem quando nada mais específico combina ("conta de luz" é luz). */
const GENERIC = new Set(['receipt-outline']);

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Sugere um ícone pelo nome/credor. Devolve null se nada combinar (aí a IA pode sugerir). */
export function suggestIcon(text: string): string | null {
  const t = ` ${normalize(text)} `;
  let best: { icon: string; len: number } | null = null;
  for (const [icon, words] of Object.entries(ICON_CATALOG)) {
    for (const w of words) {
      const k = normalize(w);
      // palavra inteira (ou início de palavra para termos com 4+ letras)
      const re = new RegExp(`[^a-z0-9]${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${k.length >= 4 ? '' : '[^a-z0-9]'}`);
      const score = GENERIC.has(icon) ? k.length - 100 : k.length;
      if (re.test(t) && (!best || score > best.len)) best = { icon, len: score };
    }
  }
  return best?.icon ?? null;
}

export const isKnownIcon = (name: unknown): name is string => typeof name === 'string' && name in ICON_CATALOG;
