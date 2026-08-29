import { INestApplication } from '@nestjs/common';
import { authed, createTestHarness, resetDatabase } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';

describe('Channels', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestHarness());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('cria um canal com configuracao nao sensivel', async () => {
    const response = await authed(app)
      .post('/channels')
      .send({
        type: 'TELEGRAM',
        name: 'Ofertas Brasil',
        externalIdentifier: '@ofertas_brasil',
        configuration: { language: 'pt-BR', template: 'default' },
      })
      .expect(201);

    expect(response.body).toMatchObject({
      type: 'TELEGRAM',
      name: 'Ofertas Brasil',
      externalIdentifier: '@ofertas_brasil',
      active: true,
      configuration: { language: 'pt-BR', template: 'default' },
    });
  });

  it('usa objeto vazio como configuracao padrao', async () => {
    const response = await authed(app)
      .post('/channels')
      .send({ type: 'WHATSAPP', name: 'Grupo Ofertas' })
      .expect(201);

    expect(response.body.configuration).toEqual({});
  });

  it('recusa credenciais em texto puro na configuracao', async () => {
    const response = await authed(app)
      .post('/channels')
      .send({
        type: 'TELEGRAM',
        name: 'Canal Inseguro',
        configuration: { botToken: '123:ABC' },
      })
      .expect(400);

    expect(JSON.stringify(response.body.message)).toContain('configuration');
    expect(await prisma.channel.count()).toBe(0);
  });

  it('recusa credenciais aninhadas na configuracao', async () => {
    await authed(app)
      .post('/channels')
      .send({
        type: 'FACEBOOK',
        name: 'Pagina Ofertas',
        configuration: { meta: { page: { accessToken: 'secreto' } } },
      })
      .expect(400);
  });

  it('recusa tipo de canal nao suportado', async () => {
    await authed(app)
      .post('/channels')
      .send({ type: 'INSTAGRAM', name: 'Perfil' })
      .expect(400);
  });

  it('recusa nome duplicado no mesmo tipo de canal', async () => {
    await authed(app)
      .post('/channels')
      .send({ type: 'TELEGRAM', name: 'Ofertas Brasil' })
      .expect(201);

    await authed(app)
      .post('/channels')
      .send({ type: 'TELEGRAM', name: 'Ofertas Brasil' })
      .expect(409);

    // O mesmo nome em outro tipo continua permitido.
    await authed(app)
      .post('/channels')
      .send({ type: 'WHATSAPP', name: 'Ofertas Brasil' })
      .expect(201);
  });

  it('edita nome e estado do canal sem alterar o tipo', async () => {
    const created = await authed(app)
      .post('/channels')
      .send({ type: 'TELEGRAM', name: 'Ofertas Brasil' })
      .expect(201);

    const updated = await authed(app)
      .patch(`/channels/${created.body.id}`)
      .send({ name: 'Ofertas BR', active: false })
      .expect(200);

    expect(updated.body).toMatchObject({ name: 'Ofertas BR', active: false, type: 'TELEGRAM' });

    await authed(app)
      .patch(`/channels/${created.body.id}`)
      .send({ type: 'WHATSAPP' })
      .expect(400);
  });
});
