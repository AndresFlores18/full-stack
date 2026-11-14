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

export type ObstacleKind = 'BOULDER' | 'CREVICE' | string;

export interface DroneObstacle {
  id?: number | string;
  type?: ObstacleKind;       // 'BOULDER' | 'CREVICE' (formato RealSense D415)
  distance_m?: number;       // Distancia polar desde la cámara D415 (m)
  bearing_deg?: number;      // Ángulo polar desde la cámara D415 (deg)
  height_m?: number;         // Altura si es BOULDER (m)
  depth_m?: number;          // Profundidad si es CREVICE (m)
  x: number;                 // Coordenada X cartesiana (m)
  y: number;                 // Coordenada Y cartesiana (m)
  radius: number;            // Radio estimado (m)
  severity: ObstacleSeverity;
}

export interface RoverPose {
  x_m: number;
  y_m: number;
  yaw_deg: number;
  traversed_distance_m: number;
}

export interface PlannerRouteData {
  explored_nodes: number;
  waypoints_xy_m: [number, number][];
}

export interface DroneNavigationData {
  mode: 'EXPLORE_FORWARD' | 'RETURN_TO_BASE' | string;
  active_planner: 'astar' | 'dijkstra' | string;
  recommended_heading_deg: number;
  rover_pose: RoverPose;
  explored_area_m2: number;
  grid_shape: [number, number];
  route_waypoints_xy_m: [number, number][];
  astar?: PlannerRouteData;
  dijkstra?: PlannerRouteData;
}

export interface DroneImagesPayload {
  format: 'jpeg_base64' | string;
  width: number;
  height: number;
  rgb: string;       // data:image/jpeg;base64,...
  depth: string;     // data:image/jpeg;base64,...
  route_map: string; // data:image/jpeg;base64,...
}

export interface RealMapStatePayload {
  grid_rows: number;                  // 120
  grid_cols: number;                  // 80
  resolution_m: number;               // 0.05m por celda
  width_m: number;                    // 4.0m (-2.0m a +2.0m)
  height_m: number;                   // 6.0m (0.0m a 6.0m)
  origin_x_m: number;                 // -2.0
  origin_y_m: number;                 // 0.0
  occupancy_grid: number[][];         // 0=FREE, 1=INFLATED, 2=BOULDER, 3=CREVICE, 255=UNEXPLORED
  cost_grid: number[][];              // Costo de navegación por celda (1.38 .. 999)
  camera_height_grid_60x80?: number[][]; // Mapa de elevación real D415 (m)
  camera_slope_grid_60x80?: number[][];  // Mapa de pendiente real D415 (deg)
}

export interface DroneData {
  // Campos normalizados (compatibles con Contrato v1.0 y RealSense D415)
  drone_pos: [number, number, number]; // [x, y, z]
  altitude_m?: number;                 // Altura real reportada por D415
  safe_path: boolean;
  safe_corridor?: boolean;             // Alias nativo de D415
  max_slope_deg: number;
  max_incline_deg?: number;            // Alias nativo de D415
  imu: IMUDrone;
  obstacles: DroneObstacle[];
  edge_fps?: number;
  navigation?: DroneNavigationData;
  images?: DroneImagesPayload;
  map_state?: RealMapStatePayload;
  battery?: number;
}

/**
 * Contenedor de carga útil enviado por el Backbone o directamente por drone_cv (RealSense D415):
 * Soporta:
 * 1) Contrato v1.0: { "node_id": "eva_esp32", "timestamp": ..., "payload": { ... } }
 * 2) Formato RealSense D415 (data/): { "node": "drone_cv", "timestamp": ..., "data": { ... }, "images": { ... }, "map_state": { ... } }
 */
export interface TelemetryEnvelope {
  node_id?: NodeId;
  node?: NodeId;
  timestamp: number;
  payload?: {
    satellite_esp32?: SatelliteData;
    station_esp32?: StationData;
    eva_esp32?: EvaData;
    drone_cv?: DroneData;
    [key: string]: any;
  } | any;
  data?: any;
  images?: DroneImagesPayload;
  map_state?: RealMapStatePayload;
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
