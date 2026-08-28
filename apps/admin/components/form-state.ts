/** Resultado de uma server action, consumido pelos formularios do painel. */
export interface FormState {
  error?: string;
  ok?: boolean;
  /** Mensagem de sucesso exibida apos a acao (ex.: resultado de um import). */
  message?: string;
}

export const EMPTY_FORM_STATE: FormState = {};

export type FieldOption = { value: string; label: string };

export type Field =
  | {
      kind: 'input';
      name: string;
      label: string;
      type: 'text' | 'url' | 'number' | 'datetime-local';
      required?: boolean;
      placeholder?: string;
      step?: string;
    }
  | {
      kind: 'select';
      name: string;
      label: string;
      required?: boolean;
      options: FieldOption[];
    };
