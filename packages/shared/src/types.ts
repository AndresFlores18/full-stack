/**
 * Contrato JSON Oficial v1.0 - NASA Space Apps: Martian Map
 * Nodos: satellite_esp32 | station_esp32 | eva_esp32 | drone_cv
 */

export type NodeId =
  | 'satellite_esp32'
  | 'station_esp32'
  | 'eva_esp32'
  | 'drone_cv'
  | string;

export interface SatelliteData {
  orbit_pos: [number, number, number]; // [x, y, z] o [lat, lon, alt]
  signal_dbm: number;
  latency_ms: number;
}

export interface StationData {
  habitat_o2: number;
  habitat_power: number;
  mesh_nodes_active: number;
}

export interface IMUEva {
  yaw: number;
  pitch: number;
  roll: number;
  accel_mag: number;
}

export interface EvaData {
  suit_o2: number;        // %
  heart_rate: number;     // bpm
  radiation_msv: number;  // mSv/h
  battery: number;        // %
  imu: IMUEva;
  // Campos normalizados / alias de conveniencia
  o2?: number;            // alias de suit_o2
  pulse?: number;         // alias de heart_rate
  radiation?: number;     // alias de radiation_msv
}

export interface IMUDrone {
  yaw: number;
  pitch: number;
  roll: number;
}

export type ObstacleSeverity = 'low' | 'medium' | 'high' | 'critical' | string;

export interface DroneObstacle {
  x: number;
  y: number;
  radius: number;
  severity: ObstacleSeverity;
}

export interface DroneData {
  drone_pos: [number, number, number]; // [x, y, z]
  safe_path: boolean;
  max_slope_deg: number;
  imu: IMUDrone;
  obstacles: DroneObstacle[];
  battery?: number;
}

/**
 * Contenedor de carga útil enviado por el Backbone:
 * {
 *   "node_id": "eva_esp32",
 *   "timestamp": 1731456000,
 *   "payload": {
 *     "eva_esp32": { ... }
 *   }
 * }
 */
export interface TelemetryEnvelope {
  node_id: NodeId;
  timestamp: number;
  payload: {
    satellite_esp32?: SatelliteData;
    station_esp32?: StationData;
    eva_esp32?: EvaData;
    drone_cv?: DroneData;
    [key: string]: any;
  } | any;
}

export interface NodeRecord<T = any> {
  node_id: string;
  lastSeen: number; // Date.now() en ms
  data: T;
  raw: TelemetryEnvelope;
}

export type RiskLevel = 'green' | 'yellow' | 'red';

export interface RiskAssessment {
  level: RiskLevel;
  reasons: string[];
}
