import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength, Matches } from 'class-validator';
import { MONEY_PATTERN } from './create-product.dto';

/**
 * `marketplace` e `marketplaceItemId` formam a identidade do produto no
 * marketplace e por isso nao aparecem aqui: com `forbidNonWhitelisted`, tentar
 * altera-los resulta em 400.
 */
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'imageUrl deve ser uma URL valida' })
  @MaxLength(2048)
  imageUrl?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'number' ? value.toFixed(2) : value))
  @IsString()
  @Matches(MONEY_PATTERN, {
    message: 'currentPrice deve ser um valor monetario positivo com ate 2 casas decimais',
  })
  currentPrice?: string;

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
