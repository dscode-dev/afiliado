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
  highlightPosition: number | null;
  highlightCheckedAt: string | null;
  sellerReputationLevel: string | null;
  sellerStatus: string | null;
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

export type AffiliateLinkSource = 'MANUAL' | 'MERCADO_LIVRE_AFFILIATE_WEB';

export interface AffiliateLink {
  id: string;
  productId: string;
  product: ProductSummary | null;
  url: string;
  label: string | null;
  sourceLabel: string | null;
  channelTag: string | null;
  source: AffiliateLinkSource;
  tag: string | null;
  originUrl: string | null;
  generatedAt: string | null;
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
  offer: {
    id: string;
    productId: string;
    status: string;
    price: string;
    productTitle: string | null;
  } | null;
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

export type OpportunityStatus = 'IGNORE' | 'CANDIDATE' | 'APPROVED' | 'NOT_ELIGIBLE';
export type OperatorDecision = 'APPROVED' | 'REJECTED';

export type ComponentName =
  | 'discount'
  | 'priceHistory'
  | 'popularity'
  | 'seller'
  | 'freshness';

export type Breakdown = Record<ComponentName, { earned: number; max: number }>;

/** Rotulos exibidos no detalhamento do score, na ordem do peso. */
export const COMPONENT_LABELS: { key: ComponentName; label: string }[] = [
  { key: 'discount', label: 'Desconto' },
  { key: 'priceHistory', label: 'Historico' },
  { key: 'popularity', label: 'Popularidade' },
  { key: 'seller', label: 'Vendedor' },
  { key: 'freshness', label: 'Freshness' },
];

export interface Opportunity {
  productId: string;
  title: string;
  category: string | null;
  permalink: string | null;
  imageUrl: string | null;
  price: string;
  originalPrice: string | null;
  score: number;
  status: OpportunityStatus;
  operatorDecision: OperatorDecision | null;
  operatorDecidedAt: string | null;
  operatorNote: string | null;
  effectiveStatus: string;
  breakdown: Breakdown;
  reasons: string[];
  evaluatedAt: string;
  hasActiveAffiliateLink: boolean;
  affiliateLinkUrl: string | null;
  offerId: string | null;
  offerStatus: OfferStatus | null;
}

export interface EvaluationResult {
  productId: string;
  productTitle: string;
  price: string;
  score: number;
  status: OpportunityStatus;
  operatorDecision: OperatorDecision | null;
  effectiveStatus: string;
  breakdown: Breakdown;
  reasons: string[];
  evaluatedAt: string;
  offerId: string | null;
  offerCreated: boolean;
  suppressedByCooldown: boolean;
}

export interface BatchEvaluationReport {
  total: number;
  approved: number;
  candidate: number;
  ignored: number;
  notEligible: number;
  failed: number;
  offersCreated: number;
  failures: { productId: string; reason: string }[];
}

export interface PopularityReport {
  categories: number;
  productsChecked: number;
  productsRanked: number;
  failedCategories: { categoryId: string; reason: string }[];
}

export interface PublishResult {
  publication: Publication;
  delivered: boolean;
  usedPhoto: boolean;
  provider: ChannelType;
}

export interface PublishAllReport {
  total: number;
  published: number;
  skipped: number;
  failed: number;
  results: { channelId: string; channelName: string; status: string; error?: string }[];
}

export interface ChannelTestResult {
  ok: true;
  provider: ChannelType;
  destination: { id: string; name: string | null };
}

export interface CycleSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  phases: string[];
  productRefresh: {
    synced: number;
    syncUnchanged: number;
    syncFailed: number;
    popularityChecked: number;
    popularityRanked: number;
    popularityFailedCategories: number;
  } | null;
  evaluation: {
    evaluated: number;
    approved: number;
    candidate: number;
    ignored: number;
    notEligible: number;
    evaluationFailed: number;
  } | null;
  distribution: {
    eligible: number;
    published: number;
    publishFailed: number;
    deferred: number;
    deferredReason: string | null;
    channels: {
      channelId: string;
      channelName: string;
      provider: ChannelType;
      published: number;
      deferred: number;
      remainingQuota: number;
    }[];
    failures: { offerId: string; channelId: string; provider: ChannelType; reason: string }[];
  } | null;
  phaseFailures: { phase: string; reason: string }[];
}

export interface ProviderStatus {
  provider: ChannelType;
  autopilotEnabled: boolean;
  minScore: number;
  maxPostsPerHour: number;
  maxPostsPerDay: number;
}

export interface AutomationStatus {
  autopilotEnabled: boolean;
  providers: ProviderStatus[];
  schedulerEnabled: boolean;
  running: boolean;
  runningPhase: string | null;
  lastRunAt: string | null;
  lastResult: CycleSummary | null;
  nextRunAt: {
    productRefresh: string | null;
    evaluation: string | null;
    distribution: string | null;
  };
  limits: {
    maxOfferAgeHours: number;
    publishWindow: string;
    timezone: string;
    withinPublishWindow: boolean;
  };
}

export interface ManualPreview {
  offerId: string;
  channelId: string;
  channelName: string;
  provider: ChannelType;
  productTitle: string;
  text: string;
  affiliateUrl: string;
  imageUrl: string | null;
  price: string;
  alreadyPublished: boolean;
  publishedAt: string | null;
}

export interface ManualPublicationResult {
  publication: Publication;
  provider: ChannelType;
}

export interface AffiliateBotStatus {
  status: 'READY' | 'AUTH_REQUIRED' | 'UNAVAILABLE';
  tag: string | null;
  detail?: string;
}

export interface AffiliateGenerationReport {
  total: number;
  generated: number;
  unchanged: number;
  failed: number;
  authRequired: number;
  failures: { productId: string; reason: string }[];
}
