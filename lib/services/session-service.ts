import { supabaseClient } from '@/lib/supabase/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SESSIONS_TABLE, SENSOR_DATA_TABLE, SESSION_PLAYERS_TABLE } from '@/lib/supabase/schema';
import { Session, SessionInsert, SessionUpdate, SessionPlayerInsert } from '@/types/supabase';
import { SessionEntity, SessionSummary, SessionType } from '@/types/database.types';
import { addSessionPlayer } from './session-player-service';

/**
 * Get all sessions
 * @returns Array of sessions
 */
export async function getAllSessions(): Promise<SessionEntity[]> {
  try {
    // First get all sessions
    const { data: sessions, error } = await supabaseClient
      .from(SESSIONS_TABLE)
      .select('*')
      .order('start_time', { ascending: false });

    if (error) {
      console.error('Error fetching sessions:', error);
      throw new Error(`Failed to fetch sessions: ${error.message}`);
    }

    // Then get all session players with player names
    const { data: sessionPlayers, error: playersError } = await supabaseClient
      .from(SESSION_PLAYERS_TABLE)
      .select(`
        session_id,
        player_id,
        device_id,
        player_profiles:player_id(name)
      `);

    if (playersError) {
      console.error('Error fetching session players:', playersError);
      // Continue with sessions but without player data
    }

    // Create a map of session_id to players
    const sessionPlayersMap = new Map<string, { player_id: string, name: string }[]>();
    
    if (sessionPlayers) {
      sessionPlayers.forEach(sp => {
        if (!sessionPlayersMap.has(sp.session_id)) {
          sessionPlayersMap.set(sp.session_id, []);
        }
        
        if (sp.player_profiles?.name) {
          sessionPlayersMap.get(sp.session_id)?.push({
            player_id: sp.player_id,
            name: sp.player_profiles.name
          });
        }
      });
    }

    // Add player data to sessions
    const sessionsWithPlayers = sessions.map(session => {
      const players = sessionPlayersMap.get(session.id) || [];
      return {
        ...session,
        players: players.map(p => ({
          player_id: p.player_id,
          playerName: p.name
        }))
      };
    });

    return sessionsWithPlayers;
  } catch (error) {
    console.error('Error in getAllSessions:', error);
    throw error;
  }
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
 * Check if a session name already exists
 * @param name Session name to check
 * @returns True if the name exists, false otherwise
 */
export async function checkSessionNameExists(name: string): Promise<boolean> {
  try {
    console.log(`Checking if session name exists: "${name}"`);
    
    // Get all sessions with this exact name
    const { data, error } = await supabaseClient
      .from(SESSIONS_TABLE)
      .select('id')
      .eq('name', name.trim());

    if (error) {
      console.error('Error checking session name:', error);
      throw new Error(`Failed to check session name: ${error.message}`);
    }

    console.log(`Found ${data?.length || 0} sessions with name "${name}"`);
    
    // Check if any sessions were found with this exact name
    return Array.isArray(data) && data.length > 0;
  } catch (error) {
    console.error('Error checking session name:', error);
    throw error;
  }
}

/**
 * Create a new session
 * @param session Session data to insert
 * @param skipNameCheck If true, skips checking if the session name already exists
 * @returns The created session
 */
export async function createSession(session: SessionInsert, skipNameCheck = false): Promise<Session> {
  // Check if name already exists
  if (session.name && !skipNameCheck) {
    const exists = await checkSessionNameExists(session.name);
    if (exists) {
      throw new Error(`Session name "${session.name}" already exists`);
    }
  }

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
 * End a session by setting its end_time to the current time and calculating duration
 * @param id Session ID
 * @returns The updated session
 */
export async function endSession(id: string): Promise<Session> {
  // Get the session to calculate duration
  const session = await getSessionById(id);
  if (!session) {
    throw new Error('Session not found');
  }

  const endTime = new Date();
  const startTime = new Date(session.start_time);
  
  // Calculate duration in seconds
  const durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
  
  console.log('Ending session:', {
    id,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    durationSeconds
  });
  
  // Use raw SQL to update both end_time and duration
  const { data, error } = await supabaseClient.rpc('update_session_duration', {
    session_id: id,
    duration_seconds: durationSeconds
  });

  if (error) {
    console.error(`Error updating session for ID ${id}:`, { error, durationSeconds });
    
    // Fall back to regular update without duration
    console.log('Falling back to regular update without duration');
    return updateSession(id, { 
      end_time: endTime.toISOString()
    });
  }

  console.log('Session updated successfully with duration');
  
  // Fetch the updated session
  const updatedSession = await getSessionById(id);
  if (!updatedSession) {
    throw new Error('Failed to fetch updated session');
  }

  return updatedSession as Session;
}

/**
 * Delete a session
 * @param id Session ID
 * @returns True if successful
 */
export async function deleteSession(id: string): Promise<boolean> {
  // First delete all sensor data records for this session
  const { error: sensorDataError } = await supabaseClient
    .from('sensor_data')
    .delete()
    .eq('session_id', id);

  if (sensorDataError) {
    console.error(`Error deleting sensor data for session ${id}:`, sensorDataError);
    throw sensorDataError;
  }

  // Then delete the session
  const { error: sessionError } = await supabaseClient
    .from(SESSIONS_TABLE)
    .delete()
    .eq('id', id);

  if (sessionError) {
    console.error(`Error deleting session with ID ${id}:`, sessionError);
    throw sessionError;
  }

  return true;
}

/**
 * Get session summary with device information and data point counts
 * @param sessionId Session ID
 * @returns Session summary or null if not found
 */
export async function getSessionSummary(sessionId: string): Promise<SessionSummary | null> {
  // First, get the session
  const session = await getSessionById(sessionId);
  
  if (!session) {
    return null;
  }
  
  // Get data points count grouped by device
  const { data: sensorData, error: sensorError } = await supabaseClient
    .from(SENSOR_DATA_TABLE)
    .select('device_id')
    .eq('session_id', sessionId);
  
  if (sensorError) {
    console.error(`Error fetching sensor data for session ${sessionId}:`, sensorError);
    throw new Error(`Failed to fetch session summary: ${sensorError.message}`);
  }
  
  // Get session players information
  const { data: sessionPlayers, error: sessionPlayersError } = await supabaseClient
    .from(SESSION_PLAYERS_TABLE)
    .select(`
      player_id,
      device_id,
      player_profiles:player_id(name)
    `)
    .eq('session_id', sessionId);
    
  if (sessionPlayersError) {
    console.error(`Error fetching session players for session ${sessionId}:`, sessionPlayersError);
  }
  
  // Create a map of device_id to player name
  const deviceToPlayerMap = new Map<string, string>();
  const playerNames: string[] = [];
  
  sessionPlayers?.forEach(sp => {
    if (sp.device_id && sp.player_profiles?.name) {
      deviceToPlayerMap.set(sp.device_id, sp.player_profiles.name);
      // Add player name to array if not already there
      if (sp.player_profiles.name && !playerNames.includes(sp.player_profiles.name)) {
        playerNames.push(sp.player_profiles.name);
      }
    }
  });
  
  // Count data points per device
  const deviceMap = new Map<string, { deviceId: string, playerName: string, dataPoints: number }>();
  
  sensorData.forEach(data => {
    const deviceId = data.device_id || 'unknown';
    const playerName = deviceToPlayerMap.get(deviceId) || 'Unknown Player';
    
    if (!deviceMap.has(deviceId)) {
      deviceMap.set(deviceId, { deviceId, playerName, dataPoints: 0 });
    }
    
    const deviceData = deviceMap.get(deviceId)!;
    deviceData.dataPoints += 1;
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
    sessionType: session.session_type,
    devices: Array.from(deviceMap.values()),
    players: playerNames,
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

/**
 * Create a new session with player-device mapping
 * @param sessionData Session data to insert
 * @param playerId Player profile ID to link to this session
 * @param deviceId Device ID to use for this player
 * @param skipNameCheck If true, skips checking if the session name already exists
 * @returns The created session
 */
export async function createSessionWithPlayerDevice(
  sessionData: {
    name?: string | null;
    session_type: SessionType;
  },
  playerId: string,
  deviceId: string,
  skipNameCheck = false
): Promise<Session> {
  // Start a transaction to create both the session and player mapping
  try {
    // 1. Create the session
    const sessionInsert: SessionInsert = {
      name: sessionData.name,
      start_time: new Date().toISOString(),
      session_type: sessionData.session_type
    };
    
    console.log('Creating session with data:', sessionInsert);
    const session = await createSession(sessionInsert, skipNameCheck);
    
    // 2. Create the player-device mapping
    const sessionPlayerInsert: SessionPlayerInsert = {
      session_id: session.id,
      player_id: playerId,
      device_id: deviceId
    };
    
    console.log('Creating session-player mapping:', sessionPlayerInsert);
    await addSessionPlayer(sessionPlayerInsert);
    
    return session;
  } catch (error) {
    console.error('Error creating session with player-device mapping:', error);
    throw new Error(`Failed to create session with player-device mapping: ${error instanceof Error ? error.message : String(error)}`);
  }
} 