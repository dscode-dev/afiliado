import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { NoSecretKeys } from '../validators/no-secret-keys.validator';

/** O tipo do canal define a integracao e nao muda apos a criacao. */
export class UpdateChannelDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'name nao pode ser vazio' })
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalIdentifier?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsObject({ message: 'configuration deve ser um objeto JSON' })
  @NoSecretKeys()
  configuration?: Record<string, unknown>;
}
