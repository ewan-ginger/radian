/**
 * Database schema definitions for the Radian Sports Analytics Dashboard
 * 
 * This file contains the SQL schema for the Supabase database tables:
 * - players: Stores information about players
 * - sessions: Stores information about recording sessions
 * - sensor_data: Stores sensor readings from ESP32 devices
 */

export const PLAYERS_TABLE = 'players';
export const SESSIONS_TABLE = 'sessions';
export const SENSOR_DATA_TABLE = 'sensor_data';

export const createPlayersTableSQL = `
CREATE TABLE ${PLAYERS_TABLE} (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  device_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
`;

export const createSessionsTableSQL = `
CREATE TABLE ${SESSIONS_TABLE} (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT,
  start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
`;

export const createSensorDataTableSQL = `
CREATE TABLE ${SENSOR_DATA_TABLE} (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES ${SESSIONS_TABLE}(id),
  player_id UUID REFERENCES ${PLAYERS_TABLE}(id),
  timestamp float8 NOT NULL,
  accelerometer_x REAL,
  accelerometer_y REAL,
  accelerometer_z REAL,
  gyroscope_x REAL,
  gyroscope_y REAL,
  gyroscope_z REAL,
  magnetometer_x REAL,
  magnetometer_y REAL,
  magnetometer_z REAL,
  orientation_x REAL,
  orientation_y REAL,
  orientation_z REAL,
  battery_level REAL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
`;

export const insertDefaultPlayerSQL = `
INSERT INTO ${PLAYERS_TABLE} (name, device_id) VALUES ('Player 1', '1');
`;

// Complete SQL script to create all tables
export const completeSchemaSQL = `
-- Create players table
${createPlayersTableSQL}

-- Create sessions table
${createSessionsTableSQL}

-- Create sensor_data table
${createSensorDataTableSQL}

-- Insert default player
${insertDefaultPlayerSQL}
`; 