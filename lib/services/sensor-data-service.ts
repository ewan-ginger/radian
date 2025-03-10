import { supabaseClient } from '@/lib/supabase/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SENSOR_DATA_TABLE } from '@/lib/supabase/schema';
import { SensorData, SensorDataInsert } from '@/types/supabase';
import { SensorDataEntity, TimeSeriesDataPoint, OrientationData } from '@/types/database.types';

/**
 * Get sensor data for a session
 * @param sessionId Session ID
 * @param limit Maximum number of records to return (default: 1000)
 * @param offset Offset for pagination (default: 0)
 * @returns Array of sensor data records
 */
export async function getSensorDataBySession(
  sessionId: string,
  limit: number = 1000,
  offset: number = 0
): Promise<SensorDataEntity[]> {
  const { data, error } = await supabaseClient
    .from(SENSOR_DATA_TABLE)
    .select('*')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error(`Error fetching sensor data for session ${sessionId}:`, error);
    throw new Error(`Failed to fetch sensor data: ${error.message}`);
  }

  return data || [];
}

/**
 * Get sensor data for a player in a session
 * @param sessionId Session ID
 * @param playerId Player ID
 * @param limit Maximum number of records to return (default: 1000)
 * @param offset Offset for pagination (default: 0)
 * @returns Array of sensor data records
 */
export async function getSensorDataBySessionAndPlayer(
  sessionId: string,
  playerId: string,
  limit: number = 1000,
  offset: number = 0
): Promise<SensorDataEntity[]> {
  const { data, error } = await supabaseClient
    .from(SENSOR_DATA_TABLE)
    .select('*')
    .eq('session_id', sessionId)
    .eq('player_id', playerId)
    .order('timestamp', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error(`Error fetching sensor data for session ${sessionId} and player ${playerId}:`, error);
    throw new Error(`Failed to fetch sensor data: ${error.message}`);
  }

  return data || [];
}

/**
 * Insert a single sensor data record
 * @param sensorData Sensor data to insert
 * @returns The inserted sensor data record
 */
export async function insertSensorData(sensorData: SensorDataInsert): Promise<SensorData> {
  const { data, error } = await supabaseClient
    .from(SENSOR_DATA_TABLE)
    .insert(sensorData)
    .select()
    .single();

  if (error) {
    console.error('Error inserting sensor data:', error);
    throw new Error(`Failed to insert sensor data: ${error.message}`);
  }

  return data;
}

/**
 * Insert multiple sensor data records in a batch
 * @param sensorDataBatch Array of sensor data records to insert
 * @returns True if successful
 */
export async function insertSensorDataBatch(sensorDataBatch: SensorDataInsert[]): Promise<boolean> {
  if (sensorDataBatch.length === 0) {
    return true;
  }

  const { error } = await supabaseClient
    .from(SENSOR_DATA_TABLE)
    .insert(sensorDataBatch);

  if (error) {
    console.error('Error inserting sensor data batch:', error);
    throw new Error(`Failed to insert sensor data batch: ${error.message}`);
  }

  return true;
}

/**
 * Get the latest sensor data for a player
 * @param playerId Player ID
 * @returns The latest sensor data record or null if not found
 */
export async function getLatestSensorDataForPlayer(playerId: string): Promise<SensorDataEntity | null> {
  const { data, error } = await supabaseClient
    .from(SENSOR_DATA_TABLE)
    .select('*')
    .eq('player_id', playerId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No data found
      return null;
    }
    console.error(`Error fetching latest sensor data for player ${playerId}:`, error);
    throw new Error(`Failed to fetch latest sensor data: ${error.message}`);
  }

  return data;
}

/**
 * Get time series data for a specific sensor value
 * @param sessionId Session ID
 * @param playerId Player ID
 * @param sensorType Type of sensor data to extract (e.g., 'accelerometer_x')
 * @param limit Maximum number of points to return (default: 100)
 * @returns Array of time series data points
 */
export async function getTimeSeriesData(
  sessionId: string,
  playerId: string,
  sensorType: keyof SensorData,
  limit: number = 100
): Promise<TimeSeriesDataPoint[]> {
  const { data, error } = await supabaseClient
    .from(SENSOR_DATA_TABLE)
    .select(`timestamp, ${sensorType}`)
    .eq('session_id', sessionId)
    .eq('player_id', playerId)
    .order('timestamp', { ascending: true })
    .limit(limit);

  if (error) {
    console.error(`Error fetching time series data for session ${sessionId} and player ${playerId}:`, error);
    throw new Error(`Failed to fetch time series data: ${error.message}`);
  }

  return data.map(item => ({
    timestamp: item.timestamp,
    value: item[sensorType] as number || 0,
  }));
}

/**
 * Get orientation data for 3D visualization
 * @param sessionId Session ID
 * @param playerId Player ID
 * @param limit Maximum number of points to return (default: 100)
 * @returns Array of orientation data points
 */
export async function getOrientationData(
  sessionId: string,
  playerId: string,
  limit: number = 100
): Promise<OrientationData[]> {
  const { data, error } = await supabaseClient
    .from(SENSOR_DATA_TABLE)
    .select('timestamp, orientation_x, orientation_y, orientation_z')
    .eq('session_id', sessionId)
    .eq('player_id', playerId)
    .order('timestamp', { ascending: true })
    .limit(limit);

  if (error) {
    console.error(`Error fetching orientation data for session ${sessionId} and player ${playerId}:`, error);
    throw new Error(`Failed to fetch orientation data: ${error.message}`);
  }

  return data.map(item => ({
    timestamp: item.timestamp,
    x: item.orientation_x || 0,
    y: item.orientation_y || 0,
    z: item.orientation_z || 0,
  }));
}

/**
 * Delete sensor data for a session
 * @param sessionId Session ID
 * @returns True if successful
 */
export async function deleteSensorDataBySession(sessionId: string): Promise<boolean> {
  const { error } = await supabaseClient
    .from(SENSOR_DATA_TABLE)
    .delete()
    .eq('session_id', sessionId);

  if (error) {
    console.error(`Error deleting sensor data for session ${sessionId}:`, error);
    throw new Error(`Failed to delete sensor data: ${error.message}`);
  }

  return true;
}

/**
 * Calculate the magnitude of a 3D vector
 * @param x X component
 * @param y Y component
 * @param z Z component
 * @returns Magnitude of the vector
 */
export function calculateMagnitude(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

/**
 * Process raw sensor data to add derived properties
 * @param data Raw sensor data
 * @returns Processed sensor data with derived properties
 */
export function processSensorData(data: SensorData): SensorDataEntity {
  const processed: SensorDataEntity = { ...data };
  
  // Calculate acceleration magnitude if all components are present
  if (
    typeof data.accelerometer_x === 'number' &&
    typeof data.accelerometer_y === 'number' &&
    typeof data.accelerometer_z === 'number'
  ) {
    processed.acceleration = calculateMagnitude(
      data.accelerometer_x,
      data.accelerometer_y,
      data.accelerometer_z
    );
  }
  
  // Calculate rotation rate magnitude if all components are present
  if (
    typeof data.gyroscope_x === 'number' &&
    typeof data.gyroscope_y === 'number' &&
    typeof data.gyroscope_z === 'number'
  ) {
    processed.rotationRate = calculateMagnitude(
      data.gyroscope_x,
      data.gyroscope_y,
      data.gyroscope_z
    );
  }
  
  return processed;
} 