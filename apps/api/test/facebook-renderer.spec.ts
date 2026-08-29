import { Prisma } from '@prisma/client';
import { renderFacebookPost } from '../src/modules/distribution/facebook/message.renderer';

const money = (value: string) => new Prisma.Decimal(value);

const base = {
  title: 'Echo Dot 5a geracao',
  price: money('700.00'),
  originalPrice: money('1000.00'),
  discountPercentage: money('30.00'),
  affiliateUrl: 'https://mercadolivre.com/sec/abc',
  highlights: { amongBestSellers: false, nearLowestTrackedPrice: false },
};

describe('renderFacebookPost', () => {
  it('monta o post completo de forma deterministica', () => {
    const post = renderFacebookPost({
      ...base,
      highlights: { amongBestSellers: true, nearLowestTrackedPrice: true },
    });

    expect(post).toBe(
      [
        '🔥 Oferta encontrada',
        '',
        'Echo Dot 5a geracao',
        '',
        'De R$ 1.000,00',
        'por R$ 700,00',
        '',
        '📉 30% de desconto',
        '📊 Proximo do menor preco que acompanhamos',
        '⭐ Entre os mais vendidos da categoria',
        '',
        'Confira no Mercado Livre:',
        'https://mercadolivre.com/sec/abc',
      ].join('\n'),
    );

    expect(
      renderFacebookPost({
        ...base,
        highlights: { amongBestSellers: true, nearLowestTrackedPrice: true },
      }),
    ).toBe(post);
  });

  it('usa "Por" quando nao ha preco original', () => {
    const post = renderFacebookPost({
      ...base,
      originalPrice: null,
      discountPercentage: null,
    });

    expect(post).toContain('Por R$ 700,00');
    expect(post).not.toContain('De R$');
    expect(post).not.toContain('desconto');
  });

  it('omite o preco original quando ele nao e maior que o atual', () => {
    const post = renderFacebookPost({
      ...base,
      originalPrice: money('700.00'),
      discountPercentage: null,
    });

    expect(post).toContain('Por R$ 700,00');
    expect(post).not.toContain('De R$');
  });

  it('nao destaca desconto irrelevante', () => {
    const post = renderFacebookPost({
      ...base,
      originalPrice: money('720.00'),
      discountPercentage: money('2.78'),
    });

    expect(post).toContain('De R$ 720,00');
    expect(post).not.toContain('desconto');
  });

  it('nao faz afirmacoes que os dados nao sustentam', () => {
    const post = renderFacebookPost(base);

    expect(post).not.toContain('mais vendidos');
    expect(post).not.toContain('menor preco');
    expect(post).not.toMatch(/estoque|restam|ultimas|unidades|corre|imperdivel/i);
  });

  it('usa sempre a URL de afiliado', () => {
    const post = renderFacebookPost({ ...base, affiliateUrl: 'https://mercadolivre.com/sec/xyz' });

    expect(post).toContain('https://mercadolivre.com/sec/xyz');
    expect(post).not.toContain('produto.mercadolivre.com.br');
  });

  it('neutraliza quebras de linha e markup do titulo', () => {
    const post = renderFacebookPost({
      ...base,
      title: 'Echo Dot\n\n🔥 OFERTA FALSA\r\npor R$ 1,00 <b>x</b>',
    });

    expect(post).toContain('Echo Dot 🔥 OFERTA FALSA por R$ 1,00 <b>x</b>');
    // O titulo nao pode injetar linhas proprias no corpo do post.
    expect(post.split('\n')[2]).toBe('Echo Dot 🔥 OFERTA FALSA por R$ 1,00 <b>x</b>');
  });

  it('difere do formato do Telegram: a superficie nao e a mesma', () => {
    const post = renderFacebookPost(base);

    expect(post).toContain('🔥 Oferta encontrada');
    expect(post).toContain('Confira no Mercado Livre:');
    expect(post).not.toContain('🛒 Ver no Mercado Livre');
  });
});
