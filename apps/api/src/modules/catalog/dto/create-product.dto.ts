import { Marketplace } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

/** NUMERIC(12,2): ate 10 digitos inteiros e no maximo 2 casas decimais. */
export const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

export class CreateProductDto {
  @IsEnum(Marketplace, { message: 'marketplace deve ser um marketplace suportado' })
  marketplace!: Marketplace;

  @IsString()
  @IsNotEmpty({ message: 'marketplaceItemId e obrigatorio' })
  @MaxLength(64)
  marketplaceItemId!: string;

  @IsString()
  @IsNotEmpty({ message: 'title e obrigatorio' })
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'imageUrl deve ser uma URL valida' })
  @MaxLength(2048)
  imageUrl?: string;

  @Transform(({ value }) => (typeof value === 'number' ? value.toFixed(2) : value))
  @IsString()
  @Matches(MONEY_PATTERN, {
    message: 'currentPrice deve ser um valor monetario positivo com ate 2 casas decimais',
  })
  currentPrice!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'number' ? value.toFixed(2) : value))
  @IsString()
  @Matches(MONEY_PATTERN, {
    message: 'originalPrice deve ser um valor monetario positivo com ate 2 casas decimais',
  })
  originalPrice?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
