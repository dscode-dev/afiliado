import { Channel, ChannelType, Prisma } from '@prisma/client';

export interface ChannelView {
  id: string;
  type: ChannelType;
  name: string;
  externalIdentifier: string | null;
  active: boolean;
  configuration: Prisma.JsonValue;
  createdAt: string;
  updatedAt: string;
}

export function toChannelView(channel: Channel): ChannelView {
  return {
    id: channel.id,
    type: channel.type,
    name: channel.name,
    externalIdentifier: channel.externalIdentifier,
    active: channel.active,
    configuration: channel.configuration,
    createdAt: channel.createdAt.toISOString(),
    updatedAt: channel.updatedAt.toISOString(),
  };
}
