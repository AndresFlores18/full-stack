import React from 'react';
import { RiskAssessment } from '@martian/shared';

interface RiskAlertBannerProps {
  risk: RiskAssessment;
}

export const RiskAlertBanner: React.FC<RiskAlertBannerProps> = ({ risk }) => {
  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: '8px',
        marginBottom: '16px',
        backgroundColor:
          risk.level === 'red' ? '#7f1d1d' : risk.level === 'yellow' ? '#78350f' : '#14532d',
        border: `1px solid ${
          risk.level === 'red' ? '#ef4444' : risk.level === 'yellow' ? '#f59e0b' : '#22c55e'
        }`,
      }}
    >
      <h3 style={{ margin: '0 0 4px 0', fontSize: '15px' }}>
        EVALUACIÓN DE RIESGO: {risk.level.toUpperCase()}
      </h3>
      {risk.reasons.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px' }}>
          {risk.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: 0, fontSize: '13px' }}>Todos los subsistemas en rango nominal.</p>
      )}
    </div>
  );
};

