import { ChannelType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { TransformBooleanQuery } from '../../../common/dto/boolean-query';

export class ListChannelsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ChannelType)
  type?: ChannelType;

  @IsOptional()
  @TransformBooleanQuery()
  @IsBoolean({ message: 'active deve ser true ou false' })
  active?: boolean;
}
