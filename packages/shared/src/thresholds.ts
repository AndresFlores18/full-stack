import { DroneData, EvaData, RiskAssessment, RiskLevel } from './types';

/**
 * Umbrales operativos oficiales para monitoreo marciano.
 * Basados en el Contrato JSON v1.0.
 */
export const THRESHOLDS = {
  O2: {
    WARNING: 85,  // % por debajo es advertencia
    CRITICAL: 75, // % por debajo es asfixia
  },
  HEART_RATE: {
    LOW_CRITICAL: 45,
    LOW_WARNING: 55,
    HIGH_WARNING: 110,
    HIGH_CRITICAL: 135,
  },
  RADIATION: {
    WARNING: 0.25,  // mSv/h
    CRITICAL: 0.50, // mSv/h
  },
  BATTERY: {
    WARNING: 25,  // %
    CRITICAL: 15, // %
  },
  SLOPE_DEG: {
    WARNING: 18,  // Grados de inclinación
    CRITICAL: 28, // Grados de inclinación con riesgo de volcamiento
  },
} as const;

/**
 * Evalúa el riesgo combinado de la telemetría del traje EVA y del dron (Edge CV).
 * Retorna nivel ('green' | 'yellow' | 'red') y razones descriptivas para alertas en UI y vibración táctica.
 */
export function evaluateRisk(
  eva?: EvaData | null,
  drone?: DroneData | null
): RiskAssessment {
  const reasons: string[] = [];
  let isCritical = false;
  let isWarning = false;

  // 1. Evaluación de EVA (Astronauta Alan)
  if (eva) {
    const o2 = eva.suit_o2 ?? eva.o2 ?? 100;
    const hr = eva.heart_rate ?? eva.pulse ?? 75;
    const rad = eva.radiation_msv ?? eva.radiation ?? 0;
    const bat = eva.battery ?? 100;

    // Oxígeno
    if (o2 <= THRESHOLDS.O2.CRITICAL) {
      isCritical = true;
      reasons.push(`O2 CRÍTICO: ${o2.toFixed(1)}%`);
    } else if (o2 <= THRESHOLDS.O2.WARNING) {
      isWarning = true;
      reasons.push(`O2 bajo: ${o2.toFixed(1)}%`);
    }

    // Ritmo cardíaco (pulso)
    if (hr <= THRESHOLDS.HEART_RATE.LOW_CRITICAL || hr >= THRESHOLDS.HEART_RATE.HIGH_CRITICAL) {
      isCritical = true;
      reasons.push(`PULSO CRÍTICO: ${hr} bpm`);
    } else if (hr <= THRESHOLDS.HEART_RATE.LOW_WARNING || hr >= THRESHOLDS.HEART_RATE.HIGH_WARNING) {
      isWarning = true;
      reasons.push(`Pulso anormal: ${hr} bpm`);
    }

    // Radiación
    if (rad >= THRESHOLDS.RADIATION.CRITICAL) {
      isCritical = true;
      reasons.push(`RADIACIÓN CRÍTICA: ${rad.toFixed(2)} mSv/h`);
    } else if (rad >= THRESHOLDS.RADIATION.WARNING) {
      isWarning = true;
      reasons.push(`Radiación elevada: ${rad.toFixed(2)} mSv/h`);
    }

    // Batería traje
    if (bat <= THRESHOLDS.BATTERY.CRITICAL) {
      isCritical = true;
      reasons.push(`BATERÍA TRAJE CRÍTICA: ${bat.toFixed(0)}%`);
    } else if (bat <= THRESHOLDS.BATTERY.WARNING) {
      isWarning = true;
      reasons.push(`Batería traje baja: ${bat.toFixed(0)}%`);
    }
  }

  // 2. Evaluación de Terreno / Dron
  if (drone) {
    if (drone.safe_path === false) {
      isCritical = true;
      reasons.push(`RUTA BLOQUEADA / INSEGURA detectada por dron`);
    }

    if (drone.max_slope_deg >= THRESHOLDS.SLOPE_DEG.CRITICAL) {
      isCritical = true;
      reasons.push(`PENDIENTE EXTREMA: ${drone.max_slope_deg}°`);
    } else if (drone.max_slope_deg >= THRESHOLDS.SLOPE_DEG.WARNING) {
      isWarning = true;
      reasons.push(`Pendiente pronunciada: ${drone.max_slope_deg}°`);
    }

    // Obstáculos críticos
    const highRiskObstacles = (drone.obstacles || []).filter(
      (obs) => obs.severity === 'critical' || obs.severity === 'high'
    );
    if (highRiskObstacles.length > 0) {
      isWarning = true;
      reasons.push(`${highRiskObstacles.length} obstáculo(s) de riesgo detectado(s)`);
    }
  }

  const level: RiskLevel = isCritical ? 'red' : isWarning ? 'yellow' : 'green';

  return {
    level,
    reasons,
  };
}
