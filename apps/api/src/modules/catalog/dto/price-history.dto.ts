import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_HISTORY_LIMIT } from '../price-snapshot.service';

export class PriceHistoryQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt({ message: 'limit deve ser um numero inteiro' })
  @Min(1)
  @Max(MAX_HISTORY_LIMIT)
  limit?: number;
}
