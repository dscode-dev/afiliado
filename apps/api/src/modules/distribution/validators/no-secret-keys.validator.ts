import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

const FORBIDDEN_KEY_PATTERN =
  /(token|secret|password|passwd|credential|api[_-]?key|access[_-]?key|private[_-]?key|authorization)/i;

/** Coleta chaves proibidas em qualquer profundidade do objeto de configuracao. */
function findSecretKeys(value: unknown, path = '', found: string[] = []): string[] {
  if (value === null || typeof value !== 'object') {
    return found;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => findSecretKeys(item, `${path}[${index}]`, found));
    return found;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (FORBIDDEN_KEY_PATTERN.test(key)) {
      found.push(currentPath);
    }

    findSecretKeys(child, currentPath, found);
  }

  return found;
}

/**
 * `Channel.configuration` guarda apenas dados operacionais nao sensiveis.
 * Este validador rejeita explicitamente qualquer tentativa de persistir
 * credenciais em texto puro - elas devem vir de environment variables.
 */
export function NoSecretKeys(options?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'noSecretKeys',
      target: object.constructor,
      propertyName: propertyName as string,
      options,
      validator: {
        validate(value: unknown): boolean {
          return findSecretKeys(value).length === 0;
        },
        defaultMessage(args: ValidationArguments): string {
          const keys = findSecretKeys(args.value).join(', ');
          return `${args.property} nao pode conter credenciais em texto puro (chaves rejeitadas: ${keys}). Use environment variables.`;
        },
      },
    });
  };
}
