import { PublicationStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class ListPublicationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PublicationStatus)
  status?: PublicationStatus;

  @IsOptional()
  @IsUUID('4')
  channelId?: string;

  @IsOptional()
  @IsUUID('4')
  offerId?: string;
}
