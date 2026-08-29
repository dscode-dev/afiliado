import { AutomationConfig } from '../src/modules/automation/automation.config';

const config = (env: Record<string, string> = {}) =>
  new AutomationConfig(env as NodeJS.ProcessEnv);

describe('AutomationConfig', () => {
  it('nasce com o autopilot DESLIGADO', () => {
    // A garantia mais importante do PR: subir a aplicacao nunca publica nada.
    expect(config().autoPublishEnabled).toBe(false);
    expect(config({ TELEGRAM_AUTO_PUBLISH_ENABLED: '' }).autoPublishEnabled).toBe(false);
    expect(config({ TELEGRAM_AUTO_PUBLISH_ENABLED: 'yes' }).autoPublishEnabled).toBe(false);
    expect(config({ TELEGRAM_AUTO_PUBLISH_ENABLED: 'TRUE' }).autoPublishEnabled).toBe(true);
  });

  it('usa defaults conservadores', () => {
    const defaults = config();

    expect(defaults.minScore).toBe(85);
    expect(defaults.maxPostsPerHour).toBe(2);
    expect(defaults.maxPostsPerDay).toBe(12);
    expect(defaults.maxOfferAgeHours).toBe(24);
    expect(defaults.productRefreshIntervalMinutes).toBe(60);
    expect(defaults.evaluationIntervalMinutes).toBe(30);
    expect(defaults.distributionIntervalMinutes).toBe(15);
    expect(defaults.timezone).toBe('America/Sao_Paulo');
  });

  it('ignora valores invalidos e mantem o default', () => {
    const invalid = config({
      TELEGRAM_MAX_POSTS_PER_HOUR: 'abc',
      PRODUCT_REFRESH_INTERVAL_MINUTES: '0',
      TELEGRAM_MIN_SCORE: '-5',
    });

    expect(invalid.maxPostsPerHour).toBe(2);
    expect(invalid.productRefreshIntervalMinutes).toBe(60);
    expect(invalid.minScore).toBe(85);
  });

  it('aceita zero como limite explicito de publicacao', () => {
    expect(config({ TELEGRAM_MAX_POSTS_PER_HOUR: '0' }).maxPostsPerHour).toBe(0);
  });

  describe('janela de publicacao', () => {
    // 15:00 em Sao Paulo (UTC-3) = 18:00 UTC.
    const at = (isoUtc: string) => new Date(isoUtc);

    it('respeita a janela diurna padrao', () => {
      const window = config({ TELEGRAM_PUBLISH_START_HOUR: '7', TELEGRAM_PUBLISH_END_HOUR: '22' });

      expect(window.isWithinPublishWindow(at('2026-06-15T18:00:00Z'))).toBe(true); // 15h local
      expect(window.isWithinPublishWindow(at('2026-06-15T06:00:00Z'))).toBe(false); // 03h local
      expect(window.isWithinPublishWindow(at('2026-06-15T02:00:00Z'))).toBe(false); // 23h local
    });

    it('trata o limite inferior como inclusivo e o superior como exclusivo', () => {
      const window = config({ TELEGRAM_PUBLISH_START_HOUR: '7', TELEGRAM_PUBLISH_END_HOUR: '22' });

      expect(window.localHour(at('2026-06-15T10:00:00Z'))).toBe(7);
      expect(window.isWithinPublishWindow(at('2026-06-15T10:00:00Z'))).toBe(true); // 07h
      expect(window.isWithinPublishWindow(at('2026-06-16T01:00:00Z'))).toBe(false); // 22h
    });

    it('suporta janela que cruza a meia-noite', () => {
      const overnight = config({
        TELEGRAM_PUBLISH_START_HOUR: '22',
        TELEGRAM_PUBLISH_END_HOUR: '6',
      });

      expect(overnight.isWithinPublishWindow(at('2026-06-16T01:00:00Z'))).toBe(true); // 22h
      expect(overnight.isWithinPublishWindow(at('2026-06-15T06:00:00Z'))).toBe(true); // 03h
      expect(overnight.isWithinPublishWindow(at('2026-06-15T18:00:00Z'))).toBe(false); // 15h
    });

    it('horas iguais significam sem restricao de horario', () => {
      const always = config({ TELEGRAM_PUBLISH_START_HOUR: '0', TELEGRAM_PUBLISH_END_HOUR: '0' });

      expect(always.isWithinPublishWindow(at('2026-06-15T06:00:00Z'))).toBe(true);
      expect(always.isWithinPublishWindow(at('2026-06-15T18:00:00Z'))).toBe(true);
    });

    it('usa a timezone configurada, nao a do processo', () => {
      const tokyo = config({ APP_TIMEZONE: 'Asia/Tokyo' });

      // 18:00 UTC = 03:00 do dia seguinte em Tokyo.
      expect(tokyo.localHour(at('2026-06-15T18:00:00Z'))).toBe(3);
    });
  });
});
