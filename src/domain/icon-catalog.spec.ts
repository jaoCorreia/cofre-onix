import { describe, expect, it } from 'vitest';
import { ICON_NAMES, isKnownIcon, suggestIcon } from './icon-catalog';

describe('suggestIcon', () => {
  it.each([
    ['Financiamento do carro', 'car-outline'],
    ['Fatura Nubank', 'card-outline'],
    ['Aluguel apartamento', 'home-outline'],
    ['Empréstimo consignado', 'cash-outline'],
    ['Conta de luz', 'flash-outline'],
    ['Tesouro IPCA+ 2035', 'leaf-outline'],
    ['Reserva de emergência', 'shield-checkmark-outline'],
    ['Marcos (amigo)', 'person-outline'],
  ])('%s -> %s', (text, icon) => expect(suggestIcon(text)).toBe(icon));

  it('não casa pedaço de palavra curta', () => {
    expect(suggestIcon('Oito parcelas')).toBeNull(); // "oi" não pode casar dentro de "oito"
  });

  it('sem palavra conhecida devolve null', () => {
    expect(suggestIcon('xyz qualquer')).toBeNull();
  });

  it('todos os ícones sugeridos estão no catálogo', () => {
    expect(ICON_NAMES.length).toBeGreaterThan(20);
    expect(isKnownIcon('car-outline')).toBe(true);
    expect(isKnownIcon('<script>')).toBe(false);
  });
});
