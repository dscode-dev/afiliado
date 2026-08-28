import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { TransformBooleanQuery } from '../../../common/dto/boolean-query';

export class ListAffiliateLinksQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @IsOptional()
  @TransformBooleanQuery()
  @IsBoolean({ message: 'active deve ser true ou false' })
  active?: boolean;
}
