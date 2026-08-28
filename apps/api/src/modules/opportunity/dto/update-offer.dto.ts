import { OfferStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { MONEY_PATTERN } from '../../catalog/dto/create-product.dto';
import { PERCENTAGE_PATTERN } from './create-offer.dto';

/** Uma oferta pertence permanentemente ao produto que a originou. */
export class UpdateOfferDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'number' ? value.toFixed(2) : value))
  @IsString()
  @Matches(MONEY_PATTERN, {
    message: 'price deve ser um valor monetario positivo com ate 2 casas decimais',
  })
  price?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'number' ? value.toFixed(2) : value))
  @IsString()
  @Matches(MONEY_PATTERN, {
    message: 'originalPrice deve ser um valor monetario positivo com ate 2 casas decimais',
  })
  originalPrice?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'number' ? value.toFixed(2) : value))
  @IsString()
  @Matches(PERCENTAGE_PATTERN, {
    message: 'discountPercentage deve estar entre 0 e 100 com ate 2 casas decimais',
  })
  discountPercentage?: string;

  @IsOptional()
  @IsEnum(OfferStatus, { message: 'status deve ser um status de oferta valido' })
  status?: OfferStatus;

  @IsOptional()
  @IsDateString({}, { message: 'detectedAt deve ser uma data ISO-8601' })
  detectedAt?: string;
}
