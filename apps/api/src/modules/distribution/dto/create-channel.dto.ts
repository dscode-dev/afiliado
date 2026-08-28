import { ChannelType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { NoSecretKeys } from '../validators/no-secret-keys.validator';

export class CreateChannelDto {
  @IsEnum(ChannelType, { message: 'type deve ser TELEGRAM, FACEBOOK ou WHATSAPP' })
  type!: ChannelType;

  @IsString()
  @IsNotEmpty({ message: 'name e obrigatorio' })
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalIdentifier?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /**
   * Apenas configuracao nao sensivel (ex.: idioma, template padrao).
   * Credenciais e tokens devem vir de environment variables.
   */
  @IsOptional()
  @IsObject({ message: 'configuration deve ser um objeto JSON' })
  @NoSecretKeys()
  configuration?: Record<string, unknown>;
}
