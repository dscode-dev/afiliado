import { IsUUID } from 'class-validator';

export class PublishOfferDto {
  @IsUUID('4', { message: 'channelId deve ser um UUID valido' })
  channelId!: string;
}
