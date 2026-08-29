import { OpportunityStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class ListOpportunitiesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OpportunityStatus, { message: 'status deve ser um status de oportunidade valido' })
  status?: OpportunityStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt({ message: 'minScore deve ser um numero inteiro' })
  @Min(0)
  @Max(100)
  minScore?: number;
}
