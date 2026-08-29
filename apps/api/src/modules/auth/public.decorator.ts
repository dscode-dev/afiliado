import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'garimpo:isPublic';

/**
 * Marca uma rota como acessivel sem sessao.
 *
 * A politica e "autenticado por padrao": tudo exige sessao, e so o que estiver
 * explicitamente marcado aqui fica publico. Um controller novo nasce protegido.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
