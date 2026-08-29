import { Breakdown, COMPONENT_LABELS } from '@/lib/types';

/**
 * Detalhamento do score. O operador precisa conseguir responder
 * "por que isso recebeu 91?" sem abrir o codigo.
 */
export function ScoreBreakdown({
  breakdown,
  score,
  reasons,
}: {
  breakdown: Breakdown;
  score: number;
  reasons: string[];
}) {
  return (
    <div className="breakdown">
      <table className="breakdown-table">
        <tbody>
          {COMPONENT_LABELS.map(({ key, label }) => {
            const part = breakdown?.[key] ?? { earned: 0, max: 0 };
            const ratio = part.max === 0 ? 0 : part.earned / part.max;

            return (
              <tr key={key}>
                <td>{label}</td>
                <td className="bar-cell">
                  <span className="bar">
                    <span className="bar-fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
                  </span>
                </td>
                <td className="num">
                  {part.earned}/{part.max}
                </td>
              </tr>
            );
          })}
          <tr className="total">
            <td>Total</td>
            <td />
            <td className="num">{score}/100</td>
          </tr>
        </tbody>
      </table>

      {reasons.length > 0 ? (
        <ul className="reasons">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
