export type Marketplace = 'MERCADO_LIVRE';
export type ChannelType = 'TELEGRAM' | 'FACEBOOK' | 'WHATSAPP';
export type OfferStatus = 'DETECTED' | 'CANDIDATE' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type PublicationStatus = 'PENDING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED';

export const CHANNEL_TYPES: ChannelType[] = ['TELEGRAM', 'FACEBOOK', 'WHATSAPP'];
export const OFFER_STATUSES: OfferStatus[] = [
  'DETECTED',
  'CANDIDATE',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
];

export interface Paginated<T> {
  data: T[];
  total: number;
  take: number;
  skip: number;
}

export interface ProductSummary {
  id: string;
  title: string;
  marketplaceItemId: string;
}

export interface Product {
  id: string;
  marketplace: Marketplace;
  marketplaceItemId: string;
  title: string;
  category: string | null;
  categoryId: string | null;
  imageUrl: string | null;
  permalink: string | null;
  sellerId: string | null;
  currencyId: string | null;
  marketplaceStatus: string | null;
  currentPrice: string;
  originalPrice: string | null;
  active: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SyncOutcome = 'created' | 'updated' | 'unchanged';

export interface SyncResult {
  product: Product;
  outcome: SyncOutcome;
  priceSnapshotCreated: boolean;
}

export interface BatchSyncReport {
  total: number;
  synced: number;
  unchanged: number;
  failed: number;
  failures: { productId: string; marketplaceItemId: string; reason: string }[];
}

export interface PriceSnapshot {
  price: string;
  originalPrice: string | null;
  currencyId: string | null;
  capturedAt: string;
}

export interface Highlight {
  position: number;
  id: string;
  type: string;
  itemId: string | null;
  title: string | null;
  imageUrl: string | null;
  permalink: string | null;
  price: string | null;
}

export interface HighlightsResult {
  siteId: string;
  categoryId: string;
  categoryName: string | null;
  total: number;
  data: Highlight[];
}

export interface AffiliateLink {
  id: string;
  productId: string;
  product: ProductSummary | null;
  url: string;
  label: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Channel {
  id: string;
  type: ChannelType;
  name: string;
  externalIdentifier: string | null;
  active: boolean;
  configuration: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface Offer {
  id: string;
  productId: string;
  product: ProductSummary | null;
  price: string;
  originalPrice: string | null;
  discountPercentage: string | null;
  status: OfferStatus;
  detectedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Publication {
  id: string;
  offerId: string;
  channelId: string;
  channel: { id: string; name: string; type: ChannelType } | null;
  offer: { id: string; productId: string; status: string } | null;
  status: PublicationStatus;
  externalMessageId: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummary {
  activeProducts: number;
  activeAffiliateLinks: number;
  activeChannels: number;
  openOffers: number;
  publications: number;
  pendingPublications: number;
}
