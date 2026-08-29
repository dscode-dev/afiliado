import { IsBoolean, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';

export class CreateAffiliateLinkDto {
  @IsUUID('4', { message: 'productId deve ser um UUID valido' })
  productId!: string;

  @IsUrl({ require_protocol: true }, { message: 'url deve ser uma URL valida' })
  @MaxLength(2048)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  /** De onde o link veio (ex.: "painel-afiliados"). Rastreio de origem. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceLabel?: string;

  /** Canal a que o link se destina, quando houver segmentacao por canal. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  channelTag?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
