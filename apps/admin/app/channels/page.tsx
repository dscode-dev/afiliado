import { CreateForm } from '@/components/create-form';
import { Field } from '@/components/form-state';
import { RowActionForm } from '@/components/row-action-form';
import { ActiveBadge, Empty, formatDate } from '@/components/ui';
import { getList } from '@/lib/api';
import { Channel, CHANNEL_TYPES } from '@/lib/types';
import { TestChannelButton } from './test-channel-button';
import { createChannel, setChannelActive } from './actions';

export const dynamic = 'force-dynamic';

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
    placeholder: '@meu_canal',
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
          Destinos de publicacao. Somente TELEGRAM e operacional nesta versao. O token do bot
          fica em environment variables e nunca neste cadastro - para Telegram, informe o canal
          em <code>externalIdentifier</code> (ex.: <code>@meu_canal</code>).
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
                    <td>{channel.type}</td>
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
                        {channel.type === 'TELEGRAM' && channel.externalIdentifier ? (
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
