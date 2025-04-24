'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Usb, Play, Pause, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRecording } from '@/context/RecordingContext';
import { formatDuration } from '@/lib/utils';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkSessionNameExists, createSessionWithPlayerDevice } from '@/lib/services/session-service';
import { LiveDataGraph } from './LiveDataGraph';
import { useRouter } from 'next/navigation';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { usePlayerData } from '@/hooks/usePlayerData';
import { SessionType } from '@/types/database.types';

// Simple Alert component since we don't have a dedicated alert component
const Alert = ({ className, children }: { className?: string, children: React.ReactNode }) => {
  return (
    <div className={`p-3 border rounded bg-yellow-50 text-yellow-800 ${className || ''}`}>
      {children}
    </div>
  );
};

// AlertDescription component
const AlertDescription = ({ children }: { children: React.ReactNode }) => {
  return <div className="text-sm">{children}</div>;
};

// Simple spinner component since we don't have a dedicated spinner component
const Spinner = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12"
  };
  
  return (
    <div className={`animate-spin rounded-full border-b-2 border-primary ${sizeClasses[size]}`}></div>
  );
};

// Need to declare the window.navigator interface for TypeScript
declare global {
  interface Navigator {
    serial?: {
      requestPort: (options?: any) => Promise<any>;
      getPorts: () => Promise<any[]>;
    };
  }
}

export function SimpleDeviceConnection() {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState('Disconnected');
  const [sensorData, setSensorData] = useState<string[]>([]);
  const [parsedSensorData, setParsedSensorData] = useState<any[]>([]);
  const [sessionName, setSessionName] = useState('');
  const [sessionNameError, setSessionNameError] = useState('');
  const [isStopping, setIsStopping] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [sessionType, setSessionType] = useState<SessionType>('solo');
  const [deviceId, setDeviceId] = useState<string>('1');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [playerSelectionError, setPlayerSelectionError] = useState<string>('');
  const [calibrationTimeRemaining, setCalibrationTimeRemaining] = useState<number | null>(null);
  const calibrationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const beepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const firstBeepTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mainBeepAudioRef = useRef<HTMLAudioElement | null>(null);
  const readyBeepAudioRef = useRef<HTMLAudioElement | null>(null);
  const setBeepAudioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutIdsRef = useRef<number[]>([]);
  const timeoutCleanupRef = useRef<(() => void) | null>(null);
  
  const { 
    isRecording, 
    recordingDuration, 
    dataPoints, 
    startRecording, 
    stopRecording, 
    addDataPoint,
    sessionId
  } = useRecording();
  
  const portRef = useRef<any | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const readLoopRef = useRef<boolean>(false);
  
  // Get player data
  const { players, isLoading: playersLoading } = usePlayerData();
  
  // Sync isStreaming with isRecording
  useEffect(() => {
    if (isRecording && !isStreaming) {
      console.log('Recording is active but streaming state is not. Updating streaming state.');
      setIsStreaming(true);
    } else if (!isRecording && isStreaming) {
      console.log('Recording is not active but streaming state is. Updating streaming state.');
      setIsStreaming(false);
    }
  }, [isRecording, isStreaming]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      disconnectSerial();
    };
  }, []);
  
  // Create audio elements for beep sounds
  useEffect(() => {
    // Create audio elements
    mainBeepAudioRef.current = new Audio('/sounds/beep.mp3');
    readyBeepAudioRef.current = new Audio('/sounds/ready-beep.mp3');
    setBeepAudioRef.current = new Audio('/sounds/set-beep.mp3');
    
    // Add error handler for the ready beep
    if (readyBeepAudioRef.current) {
      readyBeepAudioRef.current.onerror = () => {
        console.warn('Ready beep sound file not found, using fallback');
        // Use main beep as fallback
        readyBeepAudioRef.current = new Audio('/sounds/beep.mp3');
        if (readyBeepAudioRef.current) {
          readyBeepAudioRef.current.volume = 0.7;
          readyBeepAudioRef.current.playbackRate = 0.8; // Slower for "Ready"
          readyBeepAudioRef.current.load();
        }
      };
    }
    
    // Add error handler for the set beep
    if (setBeepAudioRef.current) {
      setBeepAudioRef.current.onerror = () => {
        console.warn('Set beep sound file not found, using fallback');
        // Use main beep as fallback
        setBeepAudioRef.current = new Audio('/sounds/beep.mp3');
        if (setBeepAudioRef.current) {
          setBeepAudioRef.current.volume = 0.8;
          setBeepAudioRef.current.playbackRate = 1.0; // Normal rate for "Set"
          setBeepAudioRef.current.load();
        }
      };
    }
    
    // Set properties
    if (mainBeepAudioRef.current) {
      mainBeepAudioRef.current.volume = 1.0;
      mainBeepAudioRef.current.load();
    }
    
    if (readyBeepAudioRef.current) {
      readyBeepAudioRef.current.volume = 0.8;
      readyBeepAudioRef.current.load();
    }
    
    if (setBeepAudioRef.current) {
      setBeepAudioRef.current.volume = 0.9;
      setBeepAudioRef.current.load();
    }
    
    return () => {
      mainBeepAudioRef.current = null;
      readyBeepAudioRef.current = null;
      setBeepAudioRef.current = null;
    };
  }, []);
  
  // Function to play main beep sound with retry
  const playMainBeep = (volume = 1.0) => {
    if (!mainBeepAudioRef.current) return;
    
    // Reset audio to start
    mainBeepAudioRef.current.currentTime = 0;
    
    // Set the volume for this beep
    mainBeepAudioRef.current.volume = volume;
    
    // Play with retry logic if it fails
    const playPromise = mainBeepAudioRef.current.play();
    
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.error('Error playing main beep, retrying:', err);
        // Retry after a short delay
        setTimeout(() => {
          if (mainBeepAudioRef.current) {
            mainBeepAudioRef.current.currentTime = 0;
            mainBeepAudioRef.current.play().catch(err => console.error('Retry failed:', err));
          }
        }, 100);
      });
    }
  };
  
  // Function to play ready beep sound with retry
  const playReadyBeep = (volume = 0.8) => {
    if (!readyBeepAudioRef.current) return;
    
    // Reset audio to start
    readyBeepAudioRef.current.currentTime = 0;
    
    // Set the volume for this beep
    readyBeepAudioRef.current.volume = volume;
    
    // Play with retry logic if it fails
    const playPromise = readyBeepAudioRef.current.play();
    
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.error('Error playing ready beep, retrying:', err);
        // Retry after a short delay
        setTimeout(() => {
          if (readyBeepAudioRef.current) {
            readyBeepAudioRef.current.currentTime = 0;
            readyBeepAudioRef.current.play().catch(err => console.error('Retry failed:', err));
          }
        }, 100);
      });
    }
  };
  
  // Function to play set beep sound with retry
  const playSetBeep = (volume = 0.9) => {
    if (!setBeepAudioRef.current) return;
    
    // Reset audio to start
    setBeepAudioRef.current.currentTime = 0;
    
    // Set the volume for this beep
    setBeepAudioRef.current.volume = volume;
    
    // Play with retry logic if it fails
    const playPromise = setBeepAudioRef.current.play();
    
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.error('Error playing set beep, retrying:', err);
        // Retry after a short delay
        setTimeout(() => {
          if (setBeepAudioRef.current) {
            setBeepAudioRef.current.currentTime = 0;
            setBeepAudioRef.current.play().catch(err => console.error('Retry failed:', err));
          }
        }, 100);
      });
    }
  };
  
  // Function to play the Ready-Set warning sequence
  const playReadySetSequence = (timeToMainBeep = 1000) => {
    // Calculate when to play each sound based on the time to main beep
    const readyTime = 0; // Play "Ready" immediately
    const setTime = timeToMainBeep - 500; // Play "Set" 0.5 seconds before main beep
    
    // Play "Ready" beep
    playReadyBeep();
    
    // Play "Set" beep at the calculated time
    setTimeout(() => {
      playSetBeep();
    }, setTime);
  };
  
  // Validate session name
  const validateSessionName = async () => {
    const trimmedName = sessionName.trim();
    if (!trimmedName) {
      setSessionNameError('Please enter a session name');
      return false;
    }

    try {
      console.log('Checking if session name exists:', trimmedName);
      const exists = await checkSessionNameExists(trimmedName);
      console.log('Session name exists?', exists);
      
      if (exists) {
        console.log('Session name already exists, showing error');
        setSessionNameError('A session with this name already exists');
        return false;
      }
      
      console.log('Session name is unique, proceeding');
      setSessionNameError('');
      return true;
    } catch (error) {
      console.error('Error checking session name:', error);
      // Show a more user-friendly error message
      setSessionNameError('Unable to validate session name. Please try a different name.');
      return false;
    }
  };
  
  async function connectSerial() {
    if (isConnected) {
      console.log('Already connected');
      return;
    }
    
    try {
      if (!navigator.serial) {
        setStatus('Web Serial API not supported');
        console.error('Web Serial API not supported in this browser');
        return;
      }
      
      // Request a port from the user
      console.log('Requesting serial port...');
      portRef.current = await navigator.serial.requestPort({
        // Add filters if you need specific devices
      });
      
      console.log('Port selected:', portRef.current);
      console.log('Opening port with baudRate: 115200');
      
      await portRef.current.open({ baudRate: 115200 });
      
      console.log('Port opened successfully');
      
      // Get writer
      const writer = portRef.current.writable.getWriter();
      writerRef.current = writer;
      
      // Get reader
      const reader = portRef.current.readable.getReader();
      readerRef.current = reader;
      
      setIsConnected(true);
      setStatus('Connected');
      
      // Start reading from the serial port
      readLoopRef.current = true;
      readSerial();
      
      console.log('Connection established successfully');
    } catch (error) {
      console.error('Connection failed:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async function disconnectSerial() {
    try {
      console.log('Disconnecting...');
      
      // Stop streaming if active
      if (isStreaming) {
        await handleStopStreaming();
      }
      
      // Stop the read loop
      readLoopRef.current = false;
      
      // Release reader
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current.releaseLock();
        readerRef.current = null;
      }
      
      // Release writer
      if (writerRef.current) {
        writerRef.current.releaseLock();
        writerRef.current = null;
      }
      
      // Close port
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
      
      setIsConnected(false);
      setStatus('Disconnected');
      
      console.log('Disconnected successfully');
    } catch (error) {
      console.error('Disconnection error:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async function readSerial() {
    try {
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (readLoopRef.current && readerRef.current) {
        const { value, done } = await readerRef.current.read();
        
        if (done) {
          console.log('Reader done');
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        let lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        lines.forEach(line => {
          line = line.trim();
          console.log('Received:', line);
          
          if (line.startsWith('DATA:')) {
            setSensorData(prev => [...prev.slice(-99), line]);
            
            // Only process data if we're not in the process of stopping
            if (!isStopping) {
              try {
                // Extract data values from the line
                const dataStr = line.substring(5).trim();
                const values = dataStr.split(',').map(val => parseFloat(val.trim()));
                
                if (values.length >= 15) {
                  console.log('Adding data point to recording with values:', values);
                  
                  // Parse the data for visualization with correct column mapping
                  // Order: playerID, timestamp, battery, orientationX, orientationY, orientationZ, 
                  // accelerationX, accelerationY, accelerationZ, gyroX, gyroY, gyroZ, magX, magY, magZ
                  const parsedData = {
                    timestamp: values[1] || 0,      // timestamp is column 2
                    orientation_x: values[3] || 0,   // orientation starts at column 4
                    orientation_y: values[4] || 0,
                    orientation_z: values[5] || 0,
                    accelerometer_x: values[6] || 0, // acceleration starts at column 7
                    accelerometer_y: values[7] || 0,
                    accelerometer_z: values[8] || 0,
                    gyroscope_x: values[9] || 0,    // gyroscope starts at column 10
                    gyroscope_y: values[10] || 0,
                    gyroscope_z: values[11] || 0,
                    magnetometer_x: values[12] || 0, // magnetometer starts at column 13
                    magnetometer_y: values[13] || 0,
                    magnetometer_z: values[14] || 0,
                  };
                  
                  // Update the parsed sensor data for the graph
                  setParsedSensorData(prev => {
                    const newData = [...prev, parsedData];
                    // Keep only the last 100 data points for performance
                    return newData.length > 100 ? newData.slice(-100) : newData;
                  });
                  
                  addDataPoint(values).then(result => {
                    console.log('Result of addDataPoint:', result);
                  }).catch(err => {
                    console.error('Error in addDataPoint:', err);
                  });
                } else {
                  console.warn('Invalid data format, expected 15 values but got:', values.length);
                }
              } catch (err) {
                console.error('Error parsing data:', err);
              }
            } else {
              console.log('Ignoring data point while stopping session');
            }
          }
        });
      }
      
      console.log('Read loop ended');
    } catch (error) {
      console.error('Error reading serial:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async function sendCommand(command: string) {
    if (writerRef.current && isConnected) {
      try {
        console.log(`Sending command: ${command}`);
        await writerRef.current.write(new TextEncoder().encode(command + '\n'));
        console.log(`Sent command: ${command}`);
      } catch (error) {
        console.error('Error sending command:', error);
        setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  
  // Function to start calibration timer if applicable
  const startCalibrationTimerIfNeeded = () => {
    // Check if this is a calibration session
    if (sessionType.includes('calibration')) {
      // Configuration for different calibration types
      const calibrationConfig = {
        'pass_calibration': {
          durationMinutes: 5,
          beepIntervalSeconds: 5
        },
        'groundball_calibration': {
          durationMinutes: 5,
          beepIntervalSeconds: 5
        },
        // Can add more configurations for other calibration types here
        // 'other_calibration_type': { durationMinutes: X, beepIntervalSeconds: Y }
      };
      
      // Get configuration for this session type or use default
      const config = calibrationConfig[sessionType as keyof typeof calibrationConfig] || {
        durationMinutes: 5, // Default 5 minutes
        beepIntervalSeconds: 5 // Default 5 second beep interval
      };
      
      const CALIBRATION_DURATION_MS = config.durationMinutes * 60 * 1000;
      const BEEP_INTERVAL_MS = config.beepIntervalSeconds * 1000;
      
      // Calculate end time from now
      const startTime = Date.now();
      const endTime = startTime + CALIBRATION_DURATION_MS;
      
      // Set initial time remaining
      setCalibrationTimeRemaining(CALIBRATION_DURATION_MS / 1000);
      
      // Clear any existing timers
      if (calibrationTimerRef.current) {
        clearInterval(calibrationTimerRef.current);
      }
      if (beepTimerRef.current) {
        clearInterval(beepTimerRef.current);
      }
      if (firstBeepTimeoutRef.current) {
        clearTimeout(firstBeepTimeoutRef.current);
      }
      
      // Clean up any existing timeouts
      timeoutIdsRef.current.forEach(id => window.clearTimeout(id));
      timeoutIdsRef.current = [];
      
      // Start the countdown timer
      calibrationTimerRef.current = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
        setCalibrationTimeRemaining(remaining);
        
        // Auto-stop when timer reaches 0
        if (remaining === 0) {
          clearInterval(calibrationTimerRef.current!);
          calibrationTimerRef.current = null;
          
          // Also clear beep timer
          if (beepTimerRef.current) {
            clearInterval(beepTimerRef.current);
            beepTimerRef.current = null;
          }
          
          // Clear first beep timeout if it exists
          if (firstBeepTimeoutRef.current) {
            clearTimeout(firstBeepTimeoutRef.current);
            firstBeepTimeoutRef.current = null;
          }
          
          // Only stop if still streaming
          if (isStreaming && !isStopping) {
            console.log('Calibration timer complete. Auto-stopping session.');
            // Use setTimeout to ensure this runs after the current execution context
            setTimeout(() => {
              handleStopStreaming();
            }, 0);
          }
        }
      }, 1000);
      
      console.log(`Started calibration timer for ${CALIBRATION_DURATION_MS / 1000} seconds`);
      
      // Track all timeout IDs for potential cleanup
      const timeoutIds: number[] = [];
      
      // Schedule all beeps at fixed timepoints based on the start time
      const scheduleAllBeeps = () => {
        // Add a little buffer time to ensure the first beep sequence timing is accurate
        const startTime = Date.now() + 50; // Add 50ms buffer to account for scheduling delays
        
        // Calculate the total number of beeps needed
        const totalBeepsNeeded = Math.floor(CALIBRATION_DURATION_MS / BEEP_INTERVAL_MS);
        console.log(`Scheduling ${totalBeepsNeeded} beep sequences`);
        
        // Schedule all the beeps at once with precise timing
        for (let i = 0; i < totalBeepsNeeded; i++) {
          // Calculate the exact time for this beep from the start
          const beepTime = startTime + (i + 1) * BEEP_INTERVAL_MS;
          const readyTime = beepTime - 1000; // 1 second before the beep
          const setTime = beepTime - 500; // 0.5 seconds before the beep
          
          // Log the first few beeps for debugging
          if (i < 3) {
            const nowMs = Date.now();
            console.log(`Scheduling beep ${i+1}: Ready at +${readyTime - nowMs}ms, Set at +${setTime - nowMs}ms, Go at +${beepTime - nowMs}ms`);
          }
          
          // Schedule the Ready beep
          const readyTimeoutId = window.setTimeout(() => {
            // Only play if not stopping and component is still mounted
            if (!isStopping && mainBeepAudioRef.current) {
              console.log(`Playing Ready beep ${i+1} at ${Date.now()}`);
              playReadyBeep();
            }
          }, readyTime - Date.now());
          timeoutIds.push(readyTimeoutId);
          
          // Schedule the Set beep
          const setTimeoutId = window.setTimeout(() => {
            // Only play if not stopping and component is still mounted
            if (!isStopping && mainBeepAudioRef.current) {
              console.log(`Playing Set beep ${i+1} at ${Date.now()}`);
              playSetBeep();
            }
          }, setTime - Date.now());
          timeoutIds.push(setTimeoutId);
          
          // Schedule the Go beep
          const goTimeoutId = window.setTimeout(() => {
            // Only play if not stopping and component is still mounted
            if (!isStopping && mainBeepAudioRef.current) {
              console.log(`Playing Go beep ${i+1} at ${Date.now()}`);
              playMainBeep();
            }
          }, beepTime - Date.now());
          timeoutIds.push(goTimeoutId);
        }
      };
      
      // Store the timeouts in our component-level ref
      timeoutIdsRef.current = timeoutIds;
      
      // Start scheduling all the beeps
      scheduleAllBeeps();
      
      // Return a cleanup function that will be called when the component unmounts
      // or when the session is stopped
      return () => {
        // Clear all timeout IDs
        timeoutIdsRef.current.forEach(id => window.clearTimeout(id));
        timeoutIdsRef.current = [];
      };
    }
    
    // Return empty cleanup if not a calibration session
    return () => {};
  };
  
  // Monitor calibration timer
  useEffect(() => {
    // If timer reaches zero and we're still streaming, stop the session
    if (calibrationTimeRemaining === 0 && isStreaming && !isStopping) {
      console.log('Calibration timer reached zero. Auto-stopping session.');
      handleStopStreaming();
    }
  }, [calibrationTimeRemaining, isStreaming, isStopping]);
  
  // Format the remaining time as MM:SS
  const formatRemainingTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  async function handleStartStreaming() {
    if (!isConnected) {
      console.error('Cannot start streaming: not connected to device');
      return;
    }
    
    // Validate session name
    const isValid = await validateSessionName();
    if (!isValid) {
      return;
    }
    
    // Validate player selection
    if (!selectedPlayerId) {
      setPlayerSelectionError('Please select a player profile');
      return;
    }
    
    setSessionNameError('');
    setPlayerSelectionError('');
    
    try {
      console.log('Starting recording session with name:', sessionName);
      
      // Create a new session with player-device mapping
      // Pass skipNameCheck=true since we've already validated the name above
      const session = await createSessionWithPlayerDevice(
        {
          name: sessionName,
          session_type: sessionType
        },
        selectedPlayerId,
        deviceId,
        true // Skip name check since we already did it
      );
      
      console.log('Session created with player-device mapping:', session);
      
      // Start recording session using the EXISTING session ID to avoid recreating it
      const recordingStarted = await startRecording(sessionName, session.id);
      console.log('Recording started:', recordingStarted);
      
      if (!recordingStarted) {
        console.error('Failed to start recording session');
        return;
      }
      
      // Then send start command to the device
      await sendCommand('start');
      
      // Set streaming state
      setIsStreaming(true);
      console.log('Streaming started. isStreaming:', true);
      
      // Set isStopping to false to ensure beeps will play
      setIsStopping(false);
      
      // Start calibration timer if this is a calibration session
      // and store the cleanup function
      timeoutCleanupRef.current = startCalibrationTimerIfNeeded();
    } catch (error) {
      console.error('Error starting streaming:', error);
      // If there was an error, stop the recording
      await stopRecording();
    }
  }
  
  const handleStopStreaming = async () => {
    if (!isConnected) {
      return;
    }
    
    // Prevent multiple stop attempts
    if (isStopping) {
      console.log('Already stopping, ignoring duplicate request');
      return;
    }
    
    try {
      // Set stopping state immediately
      setIsStopping(true);
      
      // Immediately stop all audio playback
      if (mainBeepAudioRef.current) {
        mainBeepAudioRef.current.pause();
        mainBeepAudioRef.current.currentTime = 0;
      }
      
      if (readyBeepAudioRef.current) {
        readyBeepAudioRef.current.pause();
        readyBeepAudioRef.current.currentTime = 0;
      }
      
      if (setBeepAudioRef.current) {
        setBeepAudioRef.current.pause();
        setBeepAudioRef.current.currentTime = 0;
      }
      
      // Clear calibration timer if it exists
      if (calibrationTimerRef.current) {
        console.log('Clearing calibration timer');
        clearInterval(calibrationTimerRef.current);
        calibrationTimerRef.current = null;
        setCalibrationTimeRemaining(null);
      }
      
      // Clear beep timer if it exists
      if (beepTimerRef.current) {
        console.log('Clearing beep timer');
        clearInterval(beepTimerRef.current);
        beepTimerRef.current = null;
      }
      
      // Clear first beep timeout if it exists
      if (firstBeepTimeoutRef.current) {
        console.log('Clearing first beep timeout');
        clearTimeout(firstBeepTimeoutRef.current);
        firstBeepTimeoutRef.current = null;
      }
      
      // Clear all scheduled setTimeout beeps
      // This will call the cleanup function returned by startCalibrationTimerIfNeeded
      if (timeoutCleanupRef.current) {
        console.log('Clearing all scheduled beep timeouts');
        timeoutCleanupRef.current();
        timeoutCleanupRef.current = null;
      }
      
      console.log('Stopping session...');
      setIsRedirecting(true);
      
      // Send stop command to the device first
      await sendCommand('stop');
      
      // Stop recording if it's active
      if (isRecording) {
        console.log('Stopping recording...');
        await stopRecording();
      }
      
      // Stop streaming and clear data
      setIsStreaming(false);
      setSensorData([]);
      setParsedSensorData([]);
      setSessionName('');
      
      console.log('Session stopped, waiting for data processing...');
      
      // Wait for 5 seconds to ensure session is processed
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.log('Redirecting to session details...');
      // Redirect to the session page or devices page
      window.location.href = sessionId ? `/sessions/${sessionId}` : '/devices';
      
    } catch (error) {
      console.error('Error stopping session:', error);
      setIsRedirecting(false);
      setIsStopping(false);
    }
  };
  
  async function handleReset() {
    if (!isConnected) {
      return;
    }
    
    try {
      await sendCommand('reset');
      setSensorData([]);
      setParsedSensorData([]);
    } catch (error) {
      console.error('Error resetting device:', error);
    }
  }
  
  // Reset all state when component mounts or when navigating to the page
  useEffect(() => {
    setIsStreaming(false);
    setSensorData([]);
    setParsedSensorData([]);
    setSessionName('');
    setSessionNameError('');
    setIsStopping(false);
    setIsRedirecting(false);
  }, []);
  
  // Available device IDs
  const deviceIds = ['1', '2', '3', '4', '5'];
  
  return (
    <div className="h-[calc(100vh-65px)] flex items-center justify-center p-4">
      <Card className={`mx-auto transition-all duration-300 ${isStreaming ? 'w-full' : 'max-w-md w-full'}`}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Device Connection</CardTitle>
          <Badge className={isConnected ? "bg-green-500" : "bg-red-500"}>
            {status}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          {isRedirecting ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
              <p className="text-sm text-muted-foreground">Saving session data...</p>
            </div>
          ) : !isConnected ? (
            <>
              <div className="flex items-center justify-center p-6">
                <Usb className="h-16 w-16 text-muted-foreground" />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Connect your ESP32 device to start collecting data for the current session.
              </p>
              <div className="text-xs text-muted-foreground mb-4">
                <p>Make sure your device is:</p>
                <ul className="list-disc pl-5 mt-2">
                  <li>Plugged into your computer</li>
                  <li>Has the correct firmware installed</li>
                  <li>Not being used by another application</li>
                </ul>
              </div>
              <Button 
                className="w-full" 
                onClick={connectSerial}
              >
                Connect Device
              </Button>
            </>
          ) : (
            <div className="space-y-6">
              {!isStreaming && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="sessionName">Session Name</Label>
                    <Input
                      id="sessionName"
                      value={sessionName}
                      onChange={(e) => {
                        setSessionName(e.target.value);
                        setSessionNameError('');
                      }}
                      placeholder="Enter a name for this session"
                      className={sessionNameError ? 'border-red-500' : ''}
                    />
                    {sessionNameError && (
                      <p className="text-sm text-red-500">{sessionNameError}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="sessionType">Session Type</Label>
                    <Select
                      value={sessionType}
                      onValueChange={(value) => setSessionType(value as SessionType)}
                    >
                      <SelectTrigger id="sessionType">
                        <SelectValue placeholder="Select session type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="solo">Solo Practice</SelectItem>
                        <SelectItem value="pass_calibration">Pass Calibration</SelectItem>
                        <SelectItem value="groundball_calibration">Ground Ball Calibration</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Select calibration session for collecting reference data
                    </p>
                    {sessionType.includes('calibration') && (
                      <p className="text-xs text-orange-500 mt-1">
                        Note: Calibration sessions will automatically end after 5 minutes
                      </p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="deviceId">Device ID</Label>
                    <Select
                      value={deviceId}
                      onValueChange={setDeviceId}
                    >
                      <SelectTrigger id="deviceId">
                        <SelectValue placeholder="Select device ID" />
                      </SelectTrigger>
                      <SelectContent>
                        {deviceIds.map(id => (
                          <SelectItem key={id} value={id}>
                            Device {id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="playerSelect">Player Profile</Label>
                    <Select
                      value={selectedPlayerId}
                      onValueChange={(value) => {
                        setSelectedPlayerId(value);
                        setPlayerSelectionError('');
                      }}
                    >
                      <SelectTrigger id="playerSelect" className={playerSelectionError ? 'border-red-500' : ''}>
                        <SelectValue placeholder="Select a player" />
                      </SelectTrigger>
                      <SelectContent>
                        {playersLoading ? (
                          <SelectItem value="loading" disabled>Loading players...</SelectItem>
                        ) : players.length === 0 ? (
                          <SelectItem value="none" disabled>No players available</SelectItem>
                        ) : (
                          players.map(player => (
                            <SelectItem key={player.id} value={player.id}>
                              {player.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {playerSelectionError && (
                      <p className="text-sm text-red-500">{playerSelectionError}</p>
                    )}
                    {players.length === 0 && !playersLoading && (
                      <Alert className="mt-2">
                        <AlertDescription>
                          No player profiles found. Please create a player profile first.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={handleStartStreaming}
                      disabled={!sessionName.trim() || !selectedPlayerId || playersLoading}
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Start Session
                    </Button>
                    <Button
                      variant="outline"
                      onClick={disconnectSerial}
                    >
                      Disconnect
                    </Button>
                  </div>
                </div>
              )}
              
              {isStreaming && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">{sessionName}</h3>
                      <p className="text-sm text-muted-foreground">
                        Duration: {formatDuration(recordingDuration)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Data Points: {dataPoints}
                      </p>
                      {sessionType.includes('calibration') && calibrationTimeRemaining !== null && (
                        <p className="text-sm font-medium text-orange-500">
                          Auto-stop in: {formatRemainingTime(calibrationTimeRemaining)}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        onClick={handleStopStreaming}
                        disabled={isStopping}
                      >
                        <Pause className="mr-2 h-4 w-4" />
                        Stop Session
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleReset}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Reset
                      </Button>
                    </div>
                  </div>
                  
                  <LiveDataGraph data={parsedSensorData} maxPoints={100} />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 