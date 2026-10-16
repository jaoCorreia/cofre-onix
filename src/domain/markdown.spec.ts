import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('negrito, itálico e código', () => {
    expect(renderMarkdown('Use **reduzir prazo** e *compare* o `CET`')).toBe(
      '<p>Use <strong>reduzir prazo</strong> e <em>compare</em> o <code>CET</code></p>',
    );
  });

  it('não confunde multiplicação com itálico', () => {
    expect(renderMarkdown('2 * 3 * 4')).toBe('<p>2 * 3 * 4</p>');
  });

  it('listas e títulos', () => {
    expect(renderMarkdown('## Resumo\n- um\n- **dois**\n\n1. a\n2. b')).toBe(
      '<h4>Resumo</h4><ul><li>um</li><li><strong>dois</strong></li></ul><ol><li>a</li><li>b</li></ol>',
    );
  });

  it('tabela', () => {
    const html = renderMarkdown('| Dívida | Taxa |\n|---|---|\n| Carro | 2,1% |');
    expect(html).toContain('<th>Dívida</th>');
    expect(html).toContain('<td>2,1%</td>');
  });

  it('parágrafo com quebra de linha', () => {
    expect(renderMarkdown('linha 1\nlinha 2\n\nnovo')).toBe('<p>linha 1<br>linha 2</p><p>novo</p>');
  });

  it('link vira só texto', () => {
    expect(renderMarkdown('veja [o site](https://mal.example)')).toBe('<p>veja o site</p>');
  });

  it.each([
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '**<b onclick="x()">oi</b>**',
    '```\n<script>x</script>\n```',
    '| <svg onload=1> | a |\n|---|---|\n| b | c |',
  ])('escapa HTML: %s', (md) => {
    const html = renderMarkdown(md);
    expect(html).not.toMatch(/<(script|img|svg|b )/i);
    expect(html).not.toMatch(/<[^>]+\son\w+=/i);
  });

  it('nunca gera tag fora da lista permitida, para qualquer texto', () => {
    const allowed = /^<\/?(p|br|strong|em|del|code|pre|h[3-6]|ul|ol|li|hr|blockquote|div class="md-table"|div|table|thead|tbody|tr|th|td)>$/;
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => {
        for (const tag of renderMarkdown(s).match(/<[^>]*>/g) ?? []) expect(tag).toMatch(allowed);
      }),
      { numRuns: 300 },
    );
  });
});
