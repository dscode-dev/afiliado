import { Matches } from 'class-validator';
import { MLB_CATEGORY_PATTERN } from '../mercado-livre.client';

export class HighlightsQueryDto {
  @Matches(MLB_CATEGORY_PATTERN, {
    message: 'categoryId deve ser um id de categoria do Mercado Livre (ex.: MLB1051)',
  })
  categoryId!: string;
}
