import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export class PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt({ message: 'take deve ser um numero inteiro' })
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  take?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt({ message: 'skip deve ser um numero inteiro' })
  @Min(0)
  skip?: number;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  take: number;
  skip: number;
}

export function paginationArgs(query: PaginationQueryDto): { take: number; skip: number } {
  return {
    take: query.take ?? DEFAULT_PAGE_SIZE,
    skip: query.skip ?? 0,
  };
}
