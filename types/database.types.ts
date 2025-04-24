/**
 * TypeScript types for database entities
 * 
 * These types represent the data structures used in the application
 * and correspond to the database schema defined in lib/supabase/schema.ts
 */

import { Player, Session, SessionPlayer, SensorData } from './supabase';

// Player entity with additional application-specific properties
export interface PlayerEntity extends Player {
  isActive?: boolean;
  lastSeen?: Date;
  stick_type: 'short-stick' | 'long-stick' | 'goalie-stick';
  position: 'attack' | 'midfield' | 'defense' | 'faceoff'| 'goalie';
  strong_hand: 'left' | 'right';
}

// Valid session types
export type SessionType = 
  | 'pass_calibration'
  | 'pass_catch_calibration'
  | 'groundball_calibration'
  | 'shot_calibration'
  | 'faceoff_calibration'
  | 'cradle_calibration'
  | '2v2'
  | 'passing_partners'
  | 'solo';

// Session entity with additional application-specific properties
export interface SessionEntity {
  id: string;
  name: string | null;
  start_time: string;
  end_time: string | null;
  duration?: unknown; // in seconds
  session_type?: SessionType; // Optional to handle null values from database
  created_at: string;
  // Additional application properties
  playerName?: string;
  dataPoints?: number;
  // Linked players and devices
  players?: SessionPlayerEntity[];
}

// Session player entity representing a player-device pair in a session
export interface SessionPlayerEntity extends SessionPlayer {
  playerName?: string; // Convenience property with the player's name
  deviceName?: string; // Convenience property with a human-readable device name
}

// Sensor data entity with additional application-specific properties
export interface SensorDataEntity {
  id: string;
  session_id: string;
  device_id: number | null;
  timestamp: number;
  accelerometer_x: number | null;
  accelerometer_y: number | null;
  accelerometer_z: number | null;
  gyroscope_x: number | null;
  gyroscope_y: number | null;
  gyroscope_z: number | null;
  magnetometer_x: number | null;
  magnetometer_y: number | null;
  magnetometer_z: number | null;
  orientation_x: number | null;
  orientation_y: number | null;
  orientation_z: number | null;
  battery_level: number | null;
  created_at: string;
  // Derived properties
  acceleration?: number; // Magnitude of acceleration vector
  rotationRate?: number; // Magnitude of rotation vector
  playerName?: string; // Resolved player name based on device_id
}

// Player statistics derived from sensor data
export interface PlayerStatistics {
  playerId: string;       // Reference to player_profiles.id
  playerName: string;     // Name from player_profiles
  totalSessions: number;
  totalDuration: number;  // in seconds
  averageAcceleration: number;
  maxAcceleration: number;
  averageRotationRate: number;
  maxRotationRate: number;
  lastSessionDate: Date;
}

// Session summary with aggregated data
export interface SessionSummary {
  sessionId: string;
  sessionName: string;
  startTime: Date;
  endTime?: Date;
  duration: number; // in seconds
  sessionType?: SessionType; // Type of session (solo, passing, etc.)
  devices: {
    deviceId: string;
    playerName: string;
    dataPoints: number;
  }[];
  players: string[]; // Array of player names involved in the session
  dataPointsCount: number;
}

// Time series data point for visualization
export interface TimeSeriesDataPoint {
  timestamp: number;
  value: number;
  label?: string;
}

// Orientation data for 3D visualization
export interface OrientationData {
  timestamp: number;
  x: number;
  y: number;
  z: number;
} 