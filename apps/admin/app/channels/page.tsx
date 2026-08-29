import { CreateForm } from '@/components/create-form';
import { Field } from '@/components/form-state';
import { RowActionForm } from '@/components/row-action-form';
import { ActiveBadge, Empty, formatDate } from '@/components/ui';
import { getList } from '@/lib/api';
import { Channel, CHANNEL_TYPES } from '@/lib/types';
import { TestChannelButton } from './test-channel-button';
import { createChannel, setChannelActive } from './actions';

export const dynamic = 'force-dynamic';

/** Somente canais automatizados podem ser testados contra o provider. */
const SUPPORTED_FOR_TEST: string[] = ['TELEGRAM', 'FACEBOOK'];

const FIELDS: Field[] = [
  {
    kind: 'select',
    name: 'type',
    label: 'Tipo',
    required: true,
    options: CHANNEL_TYPES.map((type) => ({ value: type, label: type })),
  },
  { kind: 'input', name: 'name', label: 'Nome', type: 'text', required: true },
  {
    kind: 'input',
    name: 'externalIdentifier',
    label: 'Identificador externo',
    type: 'text',
    placeholder: '@meu_canal (Telegram) ou 1234567890 (Page ID)',
  },
  {
    kind: 'input',
    name: 'configuration',
    label: 'Configuracao (JSON, sem secrets)',
    type: 'text',
    placeholder: '{"language":"pt-BR"}',
  },
];

export default async function ChannelsPage() {
  const channels = await getList<Channel>('/channels?take=100');

  return (
    <div>
      <header>
        <h2>Canais</h2>
        <p>
          Destinos de publicacao. <strong>TELEGRAM</strong> e <strong>FACEBOOK</strong> publicam
          automaticamente; <strong>WHATSAPP</strong> e semiassistido — o WhatsApp nao oferece API
          oficial para Canais, entao o painel prepara o texto e o operador publica. Tokens ficam
          em environment variables e nunca neste cadastro. Em <code>externalIdentifier</code>{' '}
          informe <code>@meu_canal</code> (Telegram) ou o <strong>Page ID</strong> (Facebook); no
          WhatsApp o campo e opcional e serve so para voce identificar o canal.
        </p>
      </header>

      <div className="card">
        <h3>Novo canal</h3>
        <CreateForm action={createChannel} fields={FIELDS} submitLabel="Cadastrar canal" />
      </div>

      <div className="card">
        <h3>Cadastrados ({channels.total})</h3>
        {channels.data.length === 0 ? (
          <Empty>Nenhum canal cadastrado ainda.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Nome</th>
                  <th>Identificador</th>
                  <th>Configuracao</th>
                  <th>Estado</th>
                  <th>Criado em</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {channels.data.map((channel) => (
                  <tr key={channel.id}>
                    <td>
                      {channel.type}
                      {channel.type === 'WHATSAPP' ? (
                        <span className="badge" style={{ marginLeft: 6 }}>
                          manual
                        </span>
                      ) : null}
                    </td>
                    <td className="wrap">{channel.name}</td>
                    <td>{channel.externalIdentifier ?? '—'}</td>
                    <td className="wrap">
                      <code>{JSON.stringify(channel.configuration)}</code>
                    </td>
                    <td>
                      <ActiveBadge active={channel.active} />
                    </td>
                    <td>{formatDate(channel.createdAt)}</td>
                    <td>
                      <div className="row-actions">
                        {SUPPORTED_FOR_TEST.includes(channel.type) && channel.externalIdentifier ? (
                          <TestChannelButton id={channel.id} />
                        ) : null}
                        <RowActionForm
                          action={setChannelActive}
                          id={channel.id}
                          values={{ active: String(!channel.active) }}
                          label={channel.active ? 'Desativar' : 'Ativar'}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
