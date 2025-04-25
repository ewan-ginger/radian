import { 
  createSession, 
  updateSession, 
  endSession as endSessionService, 
  getSessionById 
} from '../services/session-service';
import { 
  insertSensorDataBatch, 
  insertSensorData,
  processSensorData 
} from '@/lib/services/sensor-data-service';
import { 
  SessionInsert, 
  SessionUpdate, 
  SensorDataInsert 
} from '@/types/supabase';
import { getAllPlayers } from '@/lib/services/player-service';
import { addSessionPlayersBatch } from '../services/session-player-service';

/**
 * Class for managing recording sessions
 */
export class SessionManager {
  private sessionId: string | null = null;
  private playerId: string | null = null;
  private isRecording: boolean = false;
  private dataBuffer: SensorDataInsert[] = [];
  private bufferSize: number = 50; // Number of data points to buffer before saving to database
  private lastFlushTime: number = 0;
  private flushInterval: number = 5000; // Flush buffer every 5 seconds
  public sessionStartTime: number | null = null; // Track session start time
  private totalPointsReceived: number = 0; // Track total points received in this session instance
  
  // Per-device timestamp normalization state
  private firstTimestampMap: Map<string, number> = new Map(); 
  private lastNormalizedTimestampMap: Map<string, number> = new Map();
  private timestampInterval: number = 0.02; // Interval for 50Hz (seconds)
  
  private expectedDeviceIds: string[] = []; // List of device IDs expected for this session
  
  private isFlushingBuffer: boolean = false; // Track if we're currently flushing
  private pendingBuffer: SensorDataInsert[] = []; // Buffer for data received during flush
  
  /**
   * Create a new SessionManager
   * @param playerId Player ID (optional)
   * @param bufferSize Number of data points to buffer before saving to database (default: 50)
   * @param flushInterval Interval in milliseconds to flush buffer (default: 5000)
   */
  constructor(
    playerId: string | null = null, 
    bufferSize: number = 50, 
    flushInterval: number = 5000
  ) {
    this.playerId = playerId;
    this.bufferSize = bufferSize;
    this.flushInterval = flushInterval;
    console.log(`SessionManager initialized with bufferSize: ${bufferSize}, flushInterval: ${flushInterval}ms`);
  }
  
  /**
   * Initializes the manager for a specific session that has already been created.
   * @param sessionId The ID of the session.
   * @param playerDeviceMappings Array of player/device pairs for this session.
   */
  initializeSession(sessionId: string, playerDeviceMappings: { playerId: string, deviceId: string }[]): void {
    if (this.isRecording) {
      console.warn('Attempting to initialize session while another is already in progress. Ending previous session first.');
      // Optionally, call endSession or throw an error, depending on desired behavior.
      // For now, let's just reset state.
    }
    
    console.log(`Initializing SessionManager for existing session ID: ${sessionId}`);
    this.sessionId = sessionId;
    this.isRecording = true;
    this.dataBuffer = [];
    this.pendingBuffer = [];
    this.lastFlushTime = Date.now();
    this.sessionStartTime = Date.now(); // Record start time
    this.totalPointsReceived = 0; // Reset counter
    
    // Reset timestamp normalization maps and store expected devices
    this.firstTimestampMap.clear();
    this.lastNormalizedTimestampMap.clear();
    this.expectedDeviceIds = playerDeviceMappings.map(m => m.deviceId);
    // Set the primary playerId? Or maybe this manager shouldn't track a single player anymore.
    this.playerId = playerDeviceMappings.length > 0 ? playerDeviceMappings[0].playerId : null; 

    console.log(`SessionManager initialized for session ${this.sessionId}, expecting devices: ${this.expectedDeviceIds.join(', ')}`);
  }
  
  /**
   * Start a new recording session
   * @param name Session name (optional)
   * @param playerDeviceMappings Array of player/device pairs for this session
   * @returns Session ID
   */
  async startSession(name?: string, playerDeviceMappings: { playerId: string, deviceId: string }[] = []): Promise<string> {
    if (this.isRecording) {
      throw new Error('Session already in progress');
    }
    
    try {
      // Create a new session
      const sessionName = name || `Session ${new Date().toISOString()}`;
      console.log(`Creating new session with name: ${sessionName}`);
      
      const sessionData: SessionInsert = {
        name: sessionName,
        start_time: new Date().toISOString(),
      };
      
      const session = await createSession(sessionData);
      this.sessionId = session.id;
      this.isRecording = true;
      this.dataBuffer = [];
      this.lastFlushTime = Date.now();
      this.sessionStartTime = Date.now(); // Record start time
      this.totalPointsReceived = 0; // Reset counter
      
      // Reset timestamp normalization maps and store expected devices
      this.firstTimestampMap.clear();
      this.lastNormalizedTimestampMap.clear();
      this.expectedDeviceIds = playerDeviceMappings.map(m => m.deviceId);
      this.playerId = playerDeviceMappings.length > 0 ? playerDeviceMappings[0].playerId : null; // Keep track of the primary player? Or remove this.playerId altogether?
      
      // Insert playerDeviceMappings into session_players table
      try {
        await addSessionPlayersBatch(this.sessionId, playerDeviceMappings); 
        console.log(`Saved ${playerDeviceMappings.length} player/device mappings to session_players`);
      } catch (mappingError) {
        console.error('Failed to save player/device mappings:', mappingError);
        // Decide how to handle this - stop the session? Allow it to continue without mappings?
        // For now, let's log the error and continue, but mark the session as potentially problematic.
        // Consider throwing the error to prevent the session from starting if mappings are critical.
      }

      console.log(`Started session with ID: ${this.sessionId}, expecting devices: ${this.expectedDeviceIds.join(', ')}`);
      // Ensure sessionId is a string before returning
      if (!this.sessionId) {
          throw new Error('Session ID was not set after creation.');
      }
      return this.sessionId;
    } catch (error) {
      console.error('Error starting session:', error);
      throw new Error(`Failed to start session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Use an existing session instead of creating a new one
   * @param sessionId The ID of an existing session
   * @returns The session ID
   */
  async useExistingSession(sessionId: string): Promise<string> {
    if (this.isRecording) {
      throw new Error('Session already in progress');
    }
    
    try {
      console.log(`Using existing session with ID: ${sessionId}`);
      
      // Verify the session exists
      const session = await getSessionById(sessionId);
      if (!session) {
        throw new Error(`Session with ID ${sessionId} not found`);
      }
      
      this.sessionId = sessionId;
      this.isRecording = true;
      this.dataBuffer = [];
      this.lastFlushTime = Date.now();
      this.sessionStartTime = Date.now(); // Record start time
      this.totalPointsReceived = 0; // Reset counter
      
      // Reset timestamp normalization
      this.firstTimestampMap.clear();
      this.lastNormalizedTimestampMap.clear();
      
      console.log(`Using existing session with ID: ${this.sessionId}`);
      return this.sessionId;
    } catch (error) {
      console.error('Error using existing session:', error);
      throw new Error(`Failed to use existing session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * End the current recording session
   * @param intendedEndTime The timestamp when the user requested to stop.
   * @returns Session ID
   */
  async endSession(intendedEndTime: Date): Promise<string> {
    if (!this.isRecording || !this.sessionId) {
      // If called when not recording, just ensure state is clean and return gracefully
      console.warn('endSession called but no session was in progress.');
      this.isRecording = false;
      this.sessionId = null;
      this.firstTimestampMap.clear(); 
      this.lastNormalizedTimestampMap.clear();
      this.expectedDeviceIds = [];
      this.dataBuffer = [];
      this.pendingBuffer = [];
      this.sessionStartTime = null; // Reset start time
      this.totalPointsReceived = 0; // Reset counter
      return ""; // Return empty string or handle appropriately
    }
    
    const sessionId = this.sessionId;
    console.log(`Attempting to end session ${sessionId}...`);
    
    try {
      // ** Wait for any ongoing background flush to complete **
      let waitAttempts = 0;
      const maxWaitAttempts = 100; // Wait up to 5 seconds (100 * 50ms)
      while (this.isFlushingBuffer && waitAttempts < maxWaitAttempts) {
          waitAttempts++;
          console.log(`Waiting for ongoing flush to complete... Attempt: ${waitAttempts}`);
          await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (this.isFlushingBuffer) {
          console.error(`Timed out waiting for background flush to complete. Proceeding, but data integrity might be compromised.`);
          // Decide: throw error or proceed cautiously? Let's proceed for now.
      }
      
      // ** Consolidate pending data ** 
      if (this.pendingBuffer.length > 0) {
          console.log(`Moving ${this.pendingBuffer.length} pending items into main buffer before final flush.`);
          this.dataBuffer.push(...this.pendingBuffer);
          this.pendingBuffer = [];
      }

      // ** Final Flush Loop (simpler condition) **
      let attempt = 0;
      const maxFlushAttempts = 10; 
      
      console.log(`Performing final flush attempts for session ${sessionId}. Initial buffer size: ${this.dataBuffer.length}`);
      while (attempt < maxFlushAttempts && this.dataBuffer.length > 0) {
        attempt++;
        console.log(`Final flush attempt ${attempt}... Buffer size: ${this.dataBuffer.length}`);

        try {
             // Now call flushBuffer. It handles its own isFlushingBuffer check internally.
             // It will move any new pending data to the main buffer in its finally block.
             await this.flushBuffer(); 
             // No delay needed here, the loop condition re-evaluates buffer length
        } catch (flushError) {
             console.error(`Final flush attempt ${attempt} failed:`, flushError);
             // Decide if we retry or give up. Let's break for now.
             break;
        }
      }

      // Final check after loop
      if (this.dataBuffer.length > 0 || this.pendingBuffer.length > 0) { // Check pending too, just in case
           console.error(`Data still remaining in buffers after ${attempt} final flush attempts. Buffer: ${this.dataBuffer.length}, Pending: ${this.pendingBuffer.length}. DATA MAY BE LOST.`);
      }
      
      console.log(`Final flushing completed after ${attempt} attempts.`);

      // Update the session end time in the database
      try {
        const sessionUpdate: SessionUpdate = {
          end_time: intendedEndTime.toISOString(),
          // Add other fields to update if necessary, like duration or status
        };
        console.log(`Updating session ${sessionId} with end time: ${intendedEndTime.toISOString()}`);
        await updateSession(sessionId, sessionUpdate);
        console.log(`Session ${sessionId} end time updated successfully.`);
      } catch (updateError) {
        console.error(`Failed to update session end time for ${sessionId}:`, updateError);
        // Decide how to handle this error. Log it? Throw it?
        // Let's log and continue cleanup for now.
      }

      const finalSessionId = this.sessionId;
      
      // Reset state *after* potentially accessing sessionId
      this.isRecording = false;
      this.sessionId = null;
      this.firstTimestampMap.clear();
      this.lastNormalizedTimestampMap.clear();
      this.expectedDeviceIds = [];
      this.dataBuffer = []; // Already flushed, but clear just in case
      this.pendingBuffer = []; // Clear any pending items that didn't make it
      this.sessionStartTime = null; // Reset start time
      this.totalPointsReceived = 0; // Reset counter

      console.log(`Session ${finalSessionId} ended successfully.`);
      return finalSessionId || ""; // Ensure we return the ID even after resetting state
    } catch (error) {
      console.error('Error ending session:', error);
      // Reset state even on error to prevent inconsistent manager state
      this.isRecording = false;
      this.sessionId = null;
      this.firstTimestampMap.clear();
      this.lastNormalizedTimestampMap.clear();
      this.expectedDeviceIds = [];
      this.dataBuffer = [];
      this.pendingBuffer = [];
      this.sessionStartTime = null; // Reset start time
      this.totalPointsReceived = 0; // Reset counter
      throw new Error(`Failed to end session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Normalize a timestamp for a specific device relative to its first timestamp in the session
   * @param deviceId The device ID for which to normalize the timestamp
   * @param rawTimestamp Raw timestamp from the sensor
   * @returns Normalized timestamp starting from 0 and incrementing by 0.02 for that device
   */
  private normalizeTimestamp(deviceId: string, rawTimestamp: number): number {
    // If this is the first timestamp for this device, set its baseline
    if (!this.firstTimestampMap.has(deviceId)) {
      this.firstTimestampMap.set(deviceId, rawTimestamp);
      this.lastNormalizedTimestampMap.set(deviceId, 0); // Initialize last normalized time
      console.log(`Set first timestamp baseline for device ${deviceId} to: ${rawTimestamp}`);
      return 0;
    }
    
    // Calculate the normalized timestamp based on sequence for this device
    let lastNormalized = this.lastNormalizedTimestampMap.get(deviceId) || 0;
    lastNormalized += this.timestampInterval;
    this.lastNormalizedTimestampMap.set(deviceId, lastNormalized);
    
    // Use 2 decimal places for 50Hz
    return parseFloat(lastNormalized.toFixed(2)); 
  }
  
  /**
   * Add sensor data to the current session
   * @param data Array of sensor data values
   * @returns True if data was added successfully
   */
  async addSensorData(data: number[]): Promise<boolean> {
    if (!this.isRecording || !this.sessionId) {
      console.warn('Cannot add data: No session in progress', { isRecording: this.isRecording, sessionId: this.sessionId });
      return false;
    }
    
    // Get device ID from data
    const deviceId = String(data[0] || 'unknown');

    // Check if this device is expected for the current session
    if (!this.expectedDeviceIds.includes(deviceId)) {
        console.log(`Ignoring data from unexpected device ID: ${deviceId}. Expected: ${this.expectedDeviceIds.join(', ')}`);
        return false;
    }

    try {
      console.log(`Adding sensor data to session ${this.sessionId}:`, {
        dataLength: data.length,
        sessionId: this.sessionId,
        playerId: this.playerId,
        bufferSize: this.dataBuffer.length,
        isFlushingBuffer: this.isFlushingBuffer
      });
      
      // Ensure we have the correct number of values
      if (data.length < 15) {
        console.warn('Invalid data format, expected 15 values but got:', data.length);
        return false;
      }
      
      // Ensure we have a valid player ID (must be a UUID for Supabase)
      let playerIdToUse: string | null = this.playerId;
      if (!playerIdToUse) {
        try {
          const players = await getAllPlayers();
          if (players && players.length > 0) {
            playerIdToUse = players[0].id;
            console.log(`Using default player ID: ${playerIdToUse}`);
          } else {
            console.error('No players found in the database');
            return false;
          }
        } catch (playerError) {
          console.error('Error getting players:', playerError);
          return false;
        }
      }
      
      if (!playerIdToUse) {
        console.error('No valid player ID available');
        return false;
      }
      
      // Get the raw timestamp from the data
      const rawTimestamp = data[1] || Date.now();
      
      // Normalize the timestamp for this specific device
      const normalizedTimestamp = this.normalizeTimestamp(deviceId, rawTimestamp);
      console.log(`Normalized timestamp for device ${deviceId}: ${rawTimestamp} -> ${normalizedTimestamp}`);
      
      // Increment total points counter *before* adding to buffer
      this.totalPointsReceived++;
      
      // Create a sensor data record
      const sensorData: SensorDataInsert = {
        session_id: this.sessionId,
        device_id: deviceId,
        timestamp: normalizedTimestamp,
        battery_level: data[2] || 0,
        orientation_x: data[3] || 0,
        orientation_y: data[4] || 0,
        orientation_z: data[5] || 0,
        accelerometer_x: data[6] || 0,
        accelerometer_y: data[7] || 0,
        accelerometer_z: data[8] || 0,
        gyroscope_x: data[9] || 0,
        gyroscope_y: data[10] || 0,
        gyroscope_z: data[11] || 0,
        magnetometer_x: data[12] || 0,
        magnetometer_y: data[13] || 0,
        magnetometer_z: data[14] || 0
      };
      
      // If we're currently flushing, add to pending buffer
      if (this.isFlushingBuffer) {
        this.pendingBuffer.push(sensorData);
        console.log(`Added to pending buffer. Size: ${this.pendingBuffer.length}`);
      } else {
        this.dataBuffer.push(sensorData);
        console.log(`Added to main buffer. Size: ${this.dataBuffer.length}/${this.bufferSize}`);
        
        // Check if buffer should be flushed
        const now = Date.now();
        if (this.dataBuffer.length >= this.bufferSize || (now - this.lastFlushTime) >= this.flushInterval) {
          console.log(`Buffer threshold reached. Flushing ${this.dataBuffer.length} items to database.`);
          // Don't await the flush - let it happen in the background
          this.flushBuffer().catch(error => {
            console.error('Error in background flush:', error);
          });
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error adding sensor data:', error);
      return false;
    }
  }
  
  /**
   * Flush the data buffer to the database
   * @returns True if a flush was attempted (i.e., buffer was not empty), false otherwise.
   */
  private async flushBuffer(): Promise<boolean> {
    if (this.isFlushingBuffer) {
      console.log('Flush already in progress, skipping');
      return false; // Did not attempt flush
    }
    
    if (this.dataBuffer.length === 0) {
      console.log('No data to flush');
      // Even if no data, check if pending needs moving
      if (this.pendingBuffer.length > 0) {
         console.log(`Moving ${this.pendingBuffer.length} pending records to main buffer (during no-op flush)`);
         this.dataBuffer = [...this.pendingBuffer];
         this.pendingBuffer = [];
         // Indicate something happened that might require another loop check in endSession
         return true; 
      }
      return false; // Did not attempt flush
    }
    
    // Set flag and copy buffer
    this.isFlushingBuffer = true;
    const dataToFlush = [...this.dataBuffer];
    this.dataBuffer = []; 
    
    let attemptedFlush = false; // Track if we actually tried to insert
    try {
      console.log(`Flushing ${dataToFlush.length} data points to database`);
      attemptedFlush = true; // We are attempting a flush
      
      // Process data in smaller chunks
      const chunkSize = 10;
      const chunks = [];
      for (let i = 0; i < dataToFlush.length; i += chunkSize) {
        chunks.push(dataToFlush.slice(i, i + chunkSize));
      }
      
      let totalSuccess = 0;
      
      for (const chunk of chunks) {
        try {
          console.log(`Attempting to insert chunk of ${chunk.length} records...`);
          await insertSensorDataBatch(chunk);
          totalSuccess += chunk.length;
          console.log(`Successfully inserted chunk of ${chunk.length} records`);
        } catch (chunkError) {
          console.error('Chunk insertion failed:', chunkError);
          
          // Fall back to individual inserts for this chunk
          for (const record of chunk) {
            try {
              await insertSensorData(record);
              totalSuccess++;
            } catch (singleError) {
              console.error('Failed to insert individual record:', singleError);
            }
          }
        }
      }
      
      console.log(`Data flush completed: ${totalSuccess} out of ${dataToFlush.length} records inserted successfully`);
      
      // Reset last flush time only on successful attempt
      this.lastFlushTime = Date.now();
      
      return true; // Indicate flush was attempted

    } catch (error) {
      console.error('Error flushing data buffer:', error);
      // If an error occurred during insertion, we still attempted the flush
      return true; 
    } finally {
      // **Crucial:** Move pending data AFTER the flush attempt completes
      // regardless of success or failure, but BEFORE resetting the flag.
      if (this.pendingBuffer.length > 0) {
        console.log(`Moving ${this.pendingBuffer.length} pending records to main buffer (post-flush)`);
        // Prepend dataToFlush back if insert failed? Or discard? For now, just move pending.
        this.dataBuffer = [...this.dataBuffer, ...this.pendingBuffer]; // Append pending to potentially re-added dataBuffer if needed
        this.pendingBuffer = [];
      }
      this.isFlushingBuffer = false;
      console.log(`FlushBuffer finished. Attempted: ${attemptedFlush}. Final dataBuffer size: ${this.dataBuffer.length}`);
    }
  }
  
  /**
   * Get the current session ID
   * @returns Session ID or null if no session is in progress
   */
  getSessionId(): string | null {
    return this.sessionId;
  }
  
  /**
   * Check if a session is in progress
   * @returns True if a session is in progress
   */
  isSessionInProgress(): boolean {
    return this.isRecording;
  }
  
  /**
   * Set the player ID for the current session
   * @param playerId Player ID
   */
  setPlayerId(playerId: string): void {
    console.warn(`Setting player ID directly (${playerId}) - this might be deprecated if session handles multiple players.`);
    this.playerId = playerId;
  }
  
  /**
   * Get the player ID for the current session
   * @returns Player ID or null if not set
   */
  getPlayerId(): string | null {
    return this.playerId;
  }

  /**
   * Gets the number of data points currently in the main buffer.
   */
  getBufferedDataCount(): number {
    return this.dataBuffer.length;
  }

  /**
   * Gets the number of data points currently in the pending buffer (waiting for flush completion).
   */
  getPendingDataCount(): number {
    return this.pendingBuffer.length;
  }

  /**
   * Gets the total number of data points received during this session instance.
   */
  getTotalPointsReceived(): number {
    return this.totalPointsReceived;
  }
} 