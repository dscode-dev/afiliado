import { OfferStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { MONEY_PATTERN } from '../../catalog/dto/create-product.dto';

/** NUMERIC(5,2): percentual de 0.00 a 100.00. */
export const PERCENTAGE_PATTERN = /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/;

export class CreateOfferDto {
  @IsUUID('4', { message: 'productId deve ser um UUID valido' })
  productId!: string;

  @Transform(({ value }) => (typeof value === 'number' ? value.toFixed(2) : value))
  @IsString()
  @Matches(MONEY_PATTERN, {
    message: 'price deve ser um valor monetario positivo com ate 2 casas decimais',
  })
  price!: string;

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
