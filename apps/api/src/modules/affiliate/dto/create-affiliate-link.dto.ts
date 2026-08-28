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

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
