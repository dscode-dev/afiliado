import { Matches } from 'class-validator';
import { MLB_ID_PATTERN } from '../../marketplace/mercado-livre/mercado-livre.client';

export class ImportProductDto {
  @Matches(MLB_ID_PATTERN, {
    message: 'marketplaceItemId deve ser um id de item do Mercado Livre (ex.: MLB1234567890)',
  })
  marketplaceItemId!: string;
}
