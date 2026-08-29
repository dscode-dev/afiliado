import { OperatorDecision } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class OperatorDecisionDto {
  @IsEnum(OperatorDecision, { message: 'decision deve ser APPROVED ou REJECTED' })
  decision!: OperatorDecision;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
