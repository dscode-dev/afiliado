import { Marketplace } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { TransformBooleanQuery } from '../../../common/dto/boolean-query';

export class ListProductsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @TransformBooleanQuery()
  @IsBoolean({ message: 'active deve ser true ou false' })
  active?: boolean;

  @IsOptional()
  @IsEnum(Marketplace)
  marketplace?: Marketplace;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  search?: string;
}
