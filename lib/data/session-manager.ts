import { 
  createSession, 
  updateSession, 
  endSession, 
  getSessionById 
} from '@/lib/services/session-service';
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
    console.log(`SessionManager initialized with playerId: ${playerId}, bufferSize: ${bufferSize}, flushInterval: ${flushInterval}`);
  }
  
  /**
   * Start a new recording session
   * @param name Session name (optional)
   * @returns Session ID
   */
  async startSession(name?: string): Promise<string> {
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
      
      console.log(`Started session with ID: ${this.sessionId}`);
      return this.sessionId;
    } catch (error) {
      console.error('Error starting session:', error);
      throw new Error(`Failed to start session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * End the current recording session
   * @returns Session ID
   */
  async endSession(): Promise<string> {
    if (!this.isRecording || !this.sessionId) {
      throw new Error('No session in progress');
    }
    
    try {
      // Flush any remaining data
      console.log(`Flushing remaining data before ending session: ${this.dataBuffer.length} items`);
      await this.flushBuffer();
      
      // End the session
      console.log(`Ending session with ID: ${this.sessionId}`);
      await endSession(this.sessionId);
      
      const sessionId = this.sessionId;
      this.isRecording = false;
      this.sessionId = null;
      
      console.log(`Ended session with ID: ${sessionId}`);
      return sessionId;
    } catch (error) {
      console.error('Error ending session:', error);
      throw new Error(`Failed to end session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Add sensor data to the current session
   * @param data Raw sensor data array in the format [playerID, timestamp, battery, orientX, orientY, orientZ, accelX, accelY, accelZ, gyroX, gyroY, gyroZ, magX, magY, magZ]
   * @returns True if data was added successfully
   */
  async addSensorData(data: number[]): Promise<boolean> {
    // Check if a session is in progress
    if (!this.isRecording || !this.sessionId) {
      console.warn('Cannot add data: No session in progress');
      return false;
    }
    
    try {
      console.log(`Adding sensor data to session ${this.sessionId}:`, data);
      
      // Ensure we have the correct number of values
      if (data.length < 15) {
        console.warn('Invalid data format, expected 15 values but got:', data.length);
        return false;
      }
      
      // Ensure we have a valid player ID (must be a UUID for Supabase)
      let playerIdToUse: string | null = this.playerId;
      if (!playerIdToUse) {
        // If no player ID is set, try to get the default player
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
      
      // If we still don't have a player ID, we can't proceed
      if (!playerIdToUse) {
        console.error('No valid player ID available');
        return false;
      }
      
      // Create a sensor data record
      const sensorData: SensorDataInsert = {
        session_id: this.sessionId!, // Use non-null assertion since we've already checked above
        player_id: playerIdToUse, // Use the validated player ID
        timestamp: data[1] ? Number(data[1]) : Date.now(), // Use provided timestamp or current time
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
      
      console.log('Formatted sensor data:', JSON.stringify(sensorData, null, 2));
      
      // Add to buffer
      this.dataBuffer.push(sensorData);
      console.log(`Added data to buffer. Buffer size: ${this.dataBuffer.length}/${this.bufferSize}`);
      
      // Check if buffer should be flushed
      const now = Date.now();
      if (this.dataBuffer.length >= this.bufferSize || (now - this.lastFlushTime) >= this.flushInterval) {
        console.log(`Buffer threshold reached. Flushing ${this.dataBuffer.length} items to database.`);
        await this.flushBuffer();
      }
      
      // Always return true if we successfully added the data to the buffer
      return true;
    } catch (error) {
      console.error('Error adding sensor data:', error);
      return false;
    }
  }
  
  /**
   * Flush the data buffer to the database
   * @returns True if buffer was flushed successfully
   */
  private async flushBuffer(): Promise<boolean> {
    if (this.dataBuffer.length === 0) {
      console.log('No data to flush');
      return true;
    }
    
    try {
      console.log(`Flushing ${this.dataBuffer.length} data points to database`);
      console.log('First item in buffer:', JSON.stringify(this.dataBuffer[0], null, 2));
      
      // Check if we have valid session and player IDs
      if (!this.sessionId) {
        console.error('Cannot flush buffer: No session ID');
        return false;
      }
      
      if (!this.playerId) {
        console.warn('Warning: No player ID set, using default from data');
      }
      
      // Insert the buffered data
      try {
        console.log('Attempting batch insertion with Supabase...');
        await insertSensorDataBatch(this.dataBuffer);
        console.log('Batch insertion successful!');
      } catch (batchError) {
        console.error('Batch insertion failed:', batchError);
        
        // Try inserting records one by one as a fallback
        console.log('Attempting to insert records one by one...');
        let successCount = 0;
        
        for (const record of this.dataBuffer) {
          try {
            console.log('Inserting single record:', JSON.stringify(record, null, 2));
            await insertSensorData(record);
            successCount++;
            console.log(`Record ${successCount} inserted successfully`);
          } catch (singleError) {
            console.error('Failed to insert record:', singleError);
            console.error('Record that failed:', JSON.stringify(record, null, 2));
          }
        }
        
        console.log(`Inserted ${successCount}/${this.dataBuffer.length} records individually.`);
        
        if (successCount === 0) {
          console.error('All individual insertions failed');
          return false;
        }
      }
      
      // Clear the buffer
      const bufferSize = this.dataBuffer.length;
      this.dataBuffer = [];
      this.lastFlushTime = Date.now();
      
      console.log(`Data flushed successfully: ${bufferSize} records cleared from buffer`);
      return true;
    } catch (error) {
      console.error('Error flushing data buffer:', error);
      return false;
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
    console.log(`Setting player ID: ${playerId}`);
    this.playerId = playerId;
  }
  
  /**
   * Get the player ID for the current session
   * @returns Player ID or null if not set
   */
  getPlayerId(): string | null {
    return this.playerId;
  }
} 