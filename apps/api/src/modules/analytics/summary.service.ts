import { Injectable } from '@nestjs/common';
import { OfferStatus, PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Ofertas "abertas": ainda vivas no funil, ou seja, nem rejeitadas nem expiradas. */
export const OPEN_OFFER_STATUSES: OfferStatus[] = [
  OfferStatus.DETECTED,
  OfferStatus.CANDIDATE,
  OfferStatus.APPROVED,
];

export interface DashboardSummary {
  activeProducts: number;
  activeAffiliateLinks: number;
  activeChannels: number;
  openOffers: number;
  publications: number;
  pendingPublications: number;
}

@Injectable()
export class SummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(): Promise<DashboardSummary> {
    const [
      activeProducts,
      activeAffiliateLinks,
      activeChannels,
      openOffers,
      publications,
      pendingPublications,
    ] = await this.prisma.$transaction([
      this.prisma.product.count({ where: { active: true } }),
      this.prisma.affiliateLink.count({ where: { active: true } }),
      this.prisma.channel.count({ where: { active: true } }),
      this.prisma.offer.count({ where: { status: { in: OPEN_OFFER_STATUSES } } }),
      this.prisma.publication.count(),
      this.prisma.publication.count({ where: { status: PublicationStatus.PENDING } }),
    ]);

    return {
      activeProducts,
      activeAffiliateLinks,
      activeChannels,
      openOffers,
      publications,
      pendingPublications,
    };
  }
}
