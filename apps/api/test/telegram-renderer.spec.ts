import { Prisma } from '@prisma/client';
import {
  TITLE_MAX_LENGTH,
  renderOfferMessage,
  sanitizeTitle,
} from '../src/modules/distribution/telegram/message.renderer';

const money = (value: string) => new Prisma.Decimal(value);

const base = {
  title: 'Echo Dot 5a geracao',
  price: money('700.00'),
  originalPrice: money('1000.00'),
  discountPercentage: money('30.00'),
  affiliateUrl: 'https://mercadolivre.com/sec/abc',
  highlights: { amongBestSellers: false, nearLowestTrackedPrice: false },
};

describe('renderOfferMessage', () => {
  it('monta a mensagem completa de forma deterministica', () => {
    const message = renderOfferMessage({
      ...base,
      highlights: { amongBestSellers: true, nearLowestTrackedPrice: true },
    });

    expect(message).toBe(
      [
        '🔥 OFERTA',
        '',
        'Echo Dot 5a geracao',
        '',
        'De: R$ 1.000,00',
        'Por: R$ 700,00',
        '',
        '📉 30% de desconto',
        '📊 Proximo do menor preco que acompanhamos',
        '⭐ Entre os mais vendidos da categoria',
        '',
        '🛒 Ver no Mercado Livre',
        'https://mercadolivre.com/sec/abc',
      ].join('\n'),
    );

    // Deterministico: duas renderizacoes sao byte a byte iguais.
    expect(renderOfferMessage({ ...base, highlights: { amongBestSellers: true, nearLowestTrackedPrice: true } })).toBe(message);
  });

  it('omite "De:" quando nao ha preco original', () => {
    const message = renderOfferMessage({
      ...base,
      originalPrice: null,
      discountPercentage: null,
    });

    expect(message).not.toContain('De:');
    expect(message).toContain('Por: R$ 700,00');
    expect(message).not.toContain('desconto');
  });

  it('omite "De:" quando o preco original nao e maior que o atual', () => {
    const message = renderOfferMessage({
      ...base,
      originalPrice: money('700.00'),
      discountPercentage: null,
    });

    expect(message).not.toContain('De:');
  });

  it('nao inventa desconto irrelevante', () => {
    const message = renderOfferMessage({
      ...base,
      originalPrice: money('720.00'),
      discountPercentage: money('2.78'),
    });

    expect(message).toContain('De: R$ 720,00');
    expect(message).not.toContain('desconto');
  });

  it('nao faz afirmacoes que os dados nao sustentam', () => {
    const message = renderOfferMessage(base);

    expect(message).not.toContain('mais vendidos');
    expect(message).not.toContain('menor preco');
    // Nada de urgencia falsa, estoque ou vendas estimadas.
    expect(message).not.toMatch(/estoque|restam|ultimas|unidades|vendidos hoje/i);
  });

  it('usa sempre a URL de afiliado como CTA', () => {
    const message = renderOfferMessage({
      ...base,
      affiliateUrl: 'https://mercadolivre.com/sec/xyz',
    });

    expect(message).toContain('https://mercadolivre.com/sec/xyz');
    expect(message).not.toContain('produto.mercadolivre.com.br');
  });

  it('formata valores em reais com separador de milhar', () => {
    const message = renderOfferMessage({
      ...base,
      price: money('1299.90'),
      originalPrice: money('12345.60'),
      discountPercentage: null,
    });

    expect(message).toContain('Por: R$ 1.299,90');
    expect(message).toContain('De: R$ 12.345,60');
  });
});

describe('sanitizeTitle', () => {
  it('neutraliza quebras de linha e caracteres de controle', () => {
    const dirty = 'Echo Dot\n\n🔥 OFERTA FALSA\r\nPor: R$ 1,00';

    const clean = sanitizeTitle(dirty);

    expect(clean).toBe('Echo Dot 🔥 OFERTA FALSA Por: R$ 1,00');
    expect(clean).not.toContain('\n');
    expect(clean).not.toContain('\r');
  });

  it('mantem markup literal, sem interpretar (mensagem e texto puro)', () => {
    const message = renderOfferMessage({
      ...base,
      title: '<b>Produto</b> *com* _markup_ [x](http://mal.com)',
    });

    // Sem parse_mode, o markup nao tem efeito e chega literal ao canal.
    expect(message).toContain('<b>Produto</b> *com* _markup_ [x](http://mal.com)');
  });

  it('trunca titulos longos preservando o limite', () => {
    const clean = sanitizeTitle('a'.repeat(400));

    expect(clean.length).toBe(TITLE_MAX_LENGTH);
    expect(clean.endsWith('…')).toBe(true);
  });

  it('colapsa espacos redundantes', () => {
    expect(sanitizeTitle('  Produto    com   espacos  ')).toBe('Produto com espacos');
  });
});
