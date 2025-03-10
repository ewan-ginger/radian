import { supabaseClient } from '@/lib/supabase/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SESSIONS_TABLE, PLAYERS_TABLE, SENSOR_DATA_TABLE } from '@/lib/supabase/schema';
import { Session, SessionInsert, SessionUpdate } from '@/types/supabase';
import { SessionEntity, SessionSummary } from '@/types/database.types';

/**
 * Get all sessions
 * @returns Array of sessions
 */
export async function getAllSessions(): Promise<SessionEntity[]> {
  const { data, error } = await supabaseClient
    .from(SESSIONS_TABLE)
    .select('*')
    .order('start_time', { ascending: false });

  if (error) {
    console.error('Error fetching sessions:', error);
    throw new Error(`Failed to fetch sessions: ${error.message}`);
  }

  return data || [];
}

/**
 * Get a session by ID
 * @param id Session ID
 * @returns Session or null if not found
 */
export async function getSessionById(id: string): Promise<SessionEntity | null> {
  const { data, error } = await supabaseClient
    .from(SESSIONS_TABLE)
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // PGRST116 is the error code for "no rows returned"
      return null;
    }
    console.error(`Error fetching session with ID ${id}:`, error);
    throw new Error(`Failed to fetch session: ${error.message}`);
  }

  return data;
}

/**
 * Create a new session
 * @param session Session data to insert
 * @returns The created session
 */
export async function createSession(session: SessionInsert): Promise<Session> {
  const { data, error } = await supabaseClient
    .from(SESSIONS_TABLE)
    .insert(session)
    .select()
    .single();

  if (error) {
    console.error('Error creating session:', error);
    throw new Error(`Failed to create session: ${error.message}`);
  }

  return data;
}

/**
 * Update a session
 * @param id Session ID
 * @param updates Session data to update
 * @returns The updated session
 */
export async function updateSession(id: string, updates: SessionUpdate): Promise<Session> {
  const { data, error } = await supabaseClient
    .from(SESSIONS_TABLE)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error(`Error updating session with ID ${id}:`, error);
    throw new Error(`Failed to update session: ${error.message}`);
  }

  return data;
}

/**
 * End a session by setting its end_time to the current time
 * @param id Session ID
 * @returns The updated session
 */
export async function endSession(id: string): Promise<Session> {
  return updateSession(id, { end_time: new Date().toISOString() });
}

/**
 * Delete a session
 * @param id Session ID
 * @returns True if successful
 */
export async function deleteSession(id: string): Promise<boolean> {
  const { error } = await supabaseClient
    .from(SESSIONS_TABLE)
    .delete()
    .eq('id', id);

  if (error) {
    console.error(`Error deleting session with ID ${id}:`, error);
    throw new Error(`Failed to delete session: ${error.message}`);
  }

  return true;
}

/**
 * Get session summary with player information and data point counts
 * @param sessionId Session ID
 * @returns Session summary or null if not found
 */
export async function getSessionSummary(sessionId: string): Promise<SessionSummary | null> {
  // First, get the session
  const session = await getSessionById(sessionId);
  
  if (!session) {
    return null;
  }
  
  // Get data points count and player information
  const { data: sensorData, error: sensorError } = await supabaseClient
    .from(SENSOR_DATA_TABLE)
    .select(`
      player_id,
      players:player_id (
        id,
        name
      )
    `)
    .eq('session_id', sessionId);
  
  if (sensorError) {
    console.error(`Error fetching sensor data for session ${sessionId}:`, sensorError);
    throw new Error(`Failed to fetch session summary: ${sensorError.message}`);
  }
  
  // Count data points per player
  const playerMap = new Map<string, { playerId: string, playerName: string, dataPoints: number }>();
  
  sensorData.forEach(data => {
    const playerId = data.player_id;
    const playerName = data.players?.name || 'Unknown Player';
    
    if (!playerMap.has(playerId)) {
      playerMap.set(playerId, { playerId, playerName, dataPoints: 0 });
    }
    
    const playerData = playerMap.get(playerId)!;
    playerData.dataPoints += 1;
  });
  
  // Calculate duration
  const startTime = new Date(session.start_time);
  const endTime = session.end_time ? new Date(session.end_time) : new Date();
  const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000); // in seconds
  
  return {
    sessionId: session.id,
    sessionName: session.name || `Session ${session.id.substring(0, 8)}`,
    startTime,
    endTime: session.end_time ? new Date(session.end_time) : undefined,
    duration,
    players: Array.from(playerMap.values()),
    dataPointsCount: sensorData.length,
  };
}

/**
 * Server-side function to get all sessions
 * @returns Array of sessions
 */
export async function getAllSessionsServer(): Promise<SessionEntity[]> {
  const supabase = await createServerSupabaseClient();
  
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .select('*')
    .order('start_time', { ascending: false });

  if (error) {
    console.error('Error fetching sessions on server:', error);
    throw new Error(`Failed to fetch sessions on server: ${error.message}`);
  }

  return data || [];
} 