/**
 * Recortes das respostas oficiais do Mercado Livre - apenas os campos que a
 * aplicacao realmente le. O payload completo nunca entra no dominio nem no banco.
 */

export interface MeliItem {
  id: string;
  site_id?: string;
  title?: string;
  category_id?: string;
  currency_id?: string;
  permalink?: string;
  seller_id?: number | string;
  status?: string;
  thumbnail?: string;
  secure_thumbnail?: string;
  pictures?: { secure_url?: string; url?: string }[];
  price?: number;
  original_price?: number | null;
}

export interface MeliPriceEntry {
  type?: string;
  amount?: number;
  regular_amount?: number | null;
  currency_id?: string;
  conditions?: {
    start_time?: string | null;
    end_time?: string | null;
  };
}

export interface MeliPrices {
  item_id?: string;
  prices?: MeliPriceEntry[];
}

export interface MeliCategory {
  id: string;
  name?: string;
  path_from_root?: { id: string; name: string }[];
}

export interface MeliHighlightEntry {
  id: string;
  position?: number;
  type?: string;
}

export interface MeliHighlights {
  content?: MeliHighlightEntry[];
}

export interface MeliCatalogProduct {
  id: string;
  name?: string;
  status?: string;
  pictures?: { secure_url?: string; url?: string }[];
  buy_box_winner?: { item_id?: string; price?: number; currency_id?: string } | null;
}

export interface MeliUser {
  id: number | string;
  seller_reputation?: {
    level_id?: string | null;
    power_seller_status?: string | null;
  } | null;
}

/** Resposta do multiget `/items?ids=` - lista de envelopes com status por item. */
export interface MeliMultiGetEntry<T> {
  code?: number;
  body?: T;
}
