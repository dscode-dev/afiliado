import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/**
 * O vinculo com o produto e imutavel: mover um link entre produtos nao e um
 * caso de uso valido, entao `productId` nao e aceito aqui.
 */
export class UpdateAffiliateLinkDto {
  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'url deve ser uma URL valida' })
  @MaxLength(2048)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  channelTag?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
