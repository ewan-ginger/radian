/**
 * TypeScript types for database entities
 * 
 * These types represent the data structures used in the application
 * and correspond to the database schema defined in lib/supabase/schema.ts
 */

import { Player, Session, SensorData } from './supabase';

// Player entity with additional application-specific properties
export interface PlayerEntity extends Player {
  isActive?: boolean;
  lastSeen?: Date;
  stick_type: 'short-stick' | 'long-stick' | 'goalie-stick';
  position: 'attack' | 'midfield' | 'defense' | 'goalie';
  strong_hand: 'left' | 'right';
}

// Session entity with additional application-specific properties
export interface SessionEntity extends Session {
  playerName?: string;
  duration?: number; // in seconds
  dataPoints?: number;
}

// Sensor data entity with additional application-specific properties
export interface SensorDataEntity extends SensorData {
  // Derived properties
  acceleration?: number; // Magnitude of acceleration vector
  rotationRate?: number; // Magnitude of rotation vector
}

// Player statistics derived from sensor data
export interface PlayerStatistics {
  playerId: string;
  playerName: string;
  totalSessions: number;
  totalDuration: number; // in seconds
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
  players: {
    playerId: string;
    playerName: string;
    dataPoints: number;
  }[];
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