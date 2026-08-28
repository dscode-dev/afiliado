import { MercadoLivreError } from '../src/modules/marketplace/mercado-livre/mercado-livre.errors';
import {
  normalizeItem,
  normalizePrice,
  toMoneyDecimal,
} from '../src/modules/marketplace/mercado-livre/mercado-livre.normalizer';

describe('normalizeItem', () => {
  const item = {
    id: 'MLB1234567890',
    site_id: 'MLB',
    title: '  Echo Dot 5a geracao  ',
    category_id: 'MLB1051',
    currency_id: 'BRL',
    permalink: 'https://produto.mercadolivre.com.br/MLB-1234567890',
    seller_id: 987654321,
    status: 'active',
    thumbnail: 'http://http2.mlstatic.com/thumb.jpg',
    secure_thumbnail: 'https://http2.mlstatic.com/thumb.jpg',
    pictures: [{ secure_url: 'https://http2.mlstatic.com/full.jpg' }],
  };

  it('extrai apenas os campos usados pela aplicacao', () => {
    expect(normalizeItem(item, 'MLB')).toEqual({
      marketplaceItemId: 'MLB1234567890',
      title: 'Echo Dot 5a geracao',
      categoryId: 'MLB1051',
      currencyId: 'BRL',
      permalink: 'https://produto.mercadolivre.com.br/MLB-1234567890',
      sellerId: '987654321',
      imageUrl: 'https://http2.mlstatic.com/full.jpg',
      marketplaceStatus: 'active',
    });
  });

  it('prefere a imagem em alta e cai para o thumbnail seguro', () => {
    expect(normalizeItem({ ...item, pictures: [] }, 'MLB').imageUrl).toBe(
      'https://http2.mlstatic.com/thumb.jpg',
    );
    expect(
      normalizeItem({ ...item, pictures: [], secure_thumbnail: undefined }, 'MLB').imageUrl,
    ).toBe('http://http2.mlstatic.com/thumb.jpg');
  });

  it('recusa item de outro site', () => {
    expect(() => normalizeItem({ ...item, id: 'MLA999', site_id: 'MLA' }, 'MLB')).toThrow(
      MercadoLivreError,
    );
  });

  it('infere o site pelo prefixo do id quando o campo nao vem', () => {
    expect(normalizeItem({ ...item, site_id: undefined }, 'MLB').marketplaceItemId).toBe(
      'MLB1234567890',
    );
    expect(() =>
      normalizeItem({ ...item, id: 'MLA1234567890', site_id: undefined }, 'MLB'),
    ).toThrow(MercadoLivreError);
  });

  it('recusa item sem titulo utilizavel', () => {
    expect(() => normalizeItem({ ...item, title: '   ' }, 'MLB')).toThrow(MercadoLivreError);
  });

  it('aceita campos opcionais ausentes', () => {
    const minimal = normalizeItem({ id: 'MLB1', site_id: 'MLB', title: 'Produto' }, 'MLB');

    expect(minimal).toMatchObject({
      categoryId: null,
      currencyId: null,
      permalink: null,
      sellerId: null,
      imageUrl: null,
      marketplaceStatus: null,
    });
  });
});

describe('normalizePrice', () => {
  const entry = (extra: Record<string, unknown> = {}) => ({
    prices: [
      {
        type: 'standard',
        amount: 799.9,
        regular_amount: 999.9,
        currency_id: 'BRL',
        ...extra,
      },
    ],
  });

  it('usa a entrada standard como preco vigente', () => {
    const price = normalizePrice(entry(), 'MLB1');

    expect(price.price.toFixed(2)).toBe('799.90');
    expect(price.originalPrice?.toFixed(2)).toBe('999.90');
    expect(price.currencyId).toBe('BRL');
  });

  it('ignora regular_amount que nao representa desconto', () => {
    expect(normalizePrice(entry({ regular_amount: 799.9 }), 'MLB1').originalPrice).toBeNull();
    expect(normalizePrice(entry({ regular_amount: 700 }), 'MLB1').originalPrice).toBeNull();
    expect(normalizePrice(entry({ regular_amount: null }), 'MLB1').originalPrice).toBeNull();
  });

  it('prefere standard mesmo quando outros tipos vem antes', () => {
    const price = normalizePrice(
      {
        prices: [
          { type: 'promotion', amount: 10, currency_id: 'BRL' },
          { type: 'standard', amount: 42.5, currency_id: 'BRL' },
        ],
      },
      'MLB1',
    );

    expect(price.price.toFixed(2)).toBe('42.50');
  });

  it('descarta entradas com janela de validade expirada', () => {
    const now = new Date('2026-06-15T12:00:00.000Z');
    const price = normalizePrice(
      {
        prices: [
          {
            type: 'standard',
            amount: 10,
            conditions: { start_time: null, end_time: '2026-01-01T00:00:00.000Z' },
          },
          { type: 'promotion', amount: 55, conditions: { start_time: null, end_time: null } },
        ],
      },
      'MLB1',
      now,
    );

    expect(price.price.toFixed(2)).toBe('55.00');
  });

  it('recusa payload sem preco utilizavel', () => {
    expect(() => normalizePrice({ prices: [] }, 'MLB1')).toThrow(MercadoLivreError);
    expect(() => normalizePrice({}, 'MLB1')).toThrow(MercadoLivreError);
    expect(() => normalizePrice({ prices: [{ type: 'standard' }] }, 'MLB1')).toThrow(
      MercadoLivreError,
    );
    expect(() => normalizePrice({ prices: [{ type: 'standard', amount: -1 }] }, 'MLB1')).toThrow(
      MercadoLivreError,
    );
  });
});

describe('toMoneyDecimal', () => {
  it('converte sem herdar ruido de ponto flutuante', () => {
    expect(toMoneyDecimal(0.1 + 0.2).toFixed(2)).toBe('0.30');
    expect(toMoneyDecimal(1299.99).toFixed(2)).toBe('1299.99');
    expect(toMoneyDecimal(799).toFixed(2)).toBe('799.00');
  });
});
