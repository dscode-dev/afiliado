import { Transform } from 'class-transformer';

/**
 * Converte `?active=true|false` (string de query) em boolean real.
 * Valores ausentes ou vazios permanecem `undefined` para nao filtrar nada.
 */
export function TransformBooleanQuery(): PropertyDecorator {
  return Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  });
}
