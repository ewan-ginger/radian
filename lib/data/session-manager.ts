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
  private firstTimestamp: number | null = null; // Track the first timestamp for normalization
  private lastNormalizedTimestamp: number = 0; // Track the last normalized timestamp
  private timestampInterval: number = 0.1; // Interval between normalized timestamps (seconds)
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
      
      // Reset timestamp normalization
      this.firstTimestamp = null;
      this.lastNormalizedTimestamp = 0;
      
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
    
    const sessionId = this.sessionId;
    
    try {
      // Stop recording immediately to prevent new data from being added
      this.isRecording = false;
      
      // Flush any remaining data with retries
      if (this.dataBuffer.length > 0) {
        console.log(`Flushing ${this.dataBuffer.length} remaining data points before ending session`);
        let retryCount = 0;
        const maxRetries = 3;
        
        while (this.dataBuffer.length > 0 && retryCount < maxRetries) {
          try {
            await this.flushBuffer();
            break; // If successful, exit the retry loop
          } catch (flushError) {
            console.error(`Flush attempt ${retryCount + 1} failed:`, flushError);
            retryCount++;
            if (retryCount === maxRetries) {
              console.error('Max retry attempts reached for flushing data');
            }
            // Short delay before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      
      // Update session end time
      const sessionData: SessionUpdate = {
        end_time: new Date().toISOString(),
      };
      
      try {
        await updateSession(sessionId, sessionData);
      } catch (updateError) {
        console.error('Failed to update session end time:', updateError);
        // Continue with cleanup even if update fails
      }
      
      // Clean up
      this.sessionId = null;
      this.firstTimestamp = null;
      this.lastNormalizedTimestamp = 0;
      this.dataBuffer = []; // Clear any remaining data
      
      console.log(`Ended session with ID: ${sessionId}`);
      return sessionId;
    } catch (error) {
      // Even if there's an error, try to clean up
      this.sessionId = null;
      this.firstTimestamp = null;
      this.lastNormalizedTimestamp = 0;
      this.dataBuffer = [];
      
      console.error('Error ending session:', error);
      throw new Error(`Failed to end session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Normalize a timestamp relative to the first timestamp in the session
   * @param rawTimestamp Raw timestamp from the sensor
   * @returns Normalized timestamp starting from 0 and incrementing by 0.1
   */
  private normalizeTimestamp(rawTimestamp: number): number {
    // If this is the first timestamp in the session, set it as the baseline
    if (this.firstTimestamp === null) {
      this.firstTimestamp = rawTimestamp;
      console.log(`Set first timestamp baseline to: ${this.firstTimestamp}`);
      return 0;
    }
    
    // Calculate the normalized timestamp based on sequence
    // This ensures timestamps are always 0.1 seconds apart regardless of actual time
    this.lastNormalizedTimestamp += this.timestampInterval;
    return parseFloat(this.lastNormalizedTimestamp.toFixed(1)); // Ensure we have exactly one decimal place
  }
  
  /**
   * Add sensor data to the current session
   * @param data Array of sensor data values
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
      
      // Normalize the timestamp
      const normalizedTimestamp = this.normalizeTimestamp(rawTimestamp);
      console.log(`Normalized timestamp: ${rawTimestamp} -> ${normalizedTimestamp}`);
      
      // Create a sensor data record
      const sensorData: SensorDataInsert = {
        session_id: this.sessionId!,
        player_id: playerIdToUse,
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
   * @returns True if buffer was flushed successfully
   */
  private async flushBuffer(): Promise<boolean> {
    if (this.isFlushingBuffer) {
      console.log('Flush already in progress, skipping');
      return false;
    }
    
    if (this.dataBuffer.length === 0) {
      console.log('No data to flush');
      return true;
    }
    
    this.isFlushingBuffer = true;
    const dataToFlush = [...this.dataBuffer]; // Create a copy of the current buffer
    this.dataBuffer = []; // Clear the main buffer
    
    try {
      console.log(`Flushing ${dataToFlush.length} data points to database`);
      
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
      
      this.lastFlushTime = Date.now();
      
      // After successful flush, move any pending data to the main buffer
      if (this.pendingBuffer.length > 0) {
        console.log(`Moving ${this.pendingBuffer.length} pending records to main buffer`);
        this.dataBuffer = [...this.pendingBuffer];
        this.pendingBuffer = [];
      }
      
      console.log(`Data flush completed: ${totalSuccess} records inserted successfully`);
      return totalSuccess > 0;
    } catch (error) {
      console.error('Error flushing data buffer:', error);
      return false;
    } finally {
      this.isFlushingBuffer = false;
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