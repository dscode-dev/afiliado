import { IsUUID } from 'class-validator';

export class ManualChannelQueryDto {
  @IsUUID('4', { message: 'channelId deve ser um UUID valido' })
  channelId!: string;
}
