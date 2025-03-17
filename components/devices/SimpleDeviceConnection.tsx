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
import { checkSessionNameExists } from '@/lib/services/session-service';
import { LiveDataGraph } from './LiveDataGraph';
import { useRouter } from 'next/navigation';

// Add Web Serial API type definitions
declare global {
  interface Navigator {
    serial: {
      requestPort(options?: {}): Promise<SerialPort>;
      getPorts(): Promise<SerialPort[]>;
    };
  }
  
  interface SerialPort {
    open(options: { baudRate: number }): Promise<void>;
    close(): Promise<void>;
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
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
  
  const { 
    isRecording, 
    recordingDuration, 
    dataPoints, 
    startRecording, 
    stopRecording, 
    addDataPoint,
    sessionId,
    sessionData
  } = useRecording();
  
  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const readLoopRef = useRef<boolean>(false);
  
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
    try {
      console.log('Requesting serial port...');
      
      // Request port without filters to show all available devices
      const port = await navigator.serial.requestPort({});
      portRef.current = port;
      
      console.log('Port selected:', port);
      console.log('Opening port with baudRate: 115200');
      
      await port.open({ baudRate: 115200 });
      
      console.log('Port opened successfully');
      
      // Get writer
      const writer = port.writable.getWriter();
      writerRef.current = writer;
      
      // Get reader
      const reader = port.readable.getReader();
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
    
    try {
      console.log('Starting recording session with name:', sessionName);
      // Start recording session first
      const recordingStarted = await startRecording(sessionName);
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
    
    try {
      setIsStopping(true);
      setIsRedirecting(true);
      
      // Send stop command to the device first
      await sendCommand('stop');
      
      // Stop recording if it's active
      if (isRecording) {
        await stopRecording();
      }
      
      // Stop streaming and clear data
      setIsStreaming(false);
      setSensorData([]);
      setParsedSensorData([]);
      setSessionName('');
      
      // Wait for 5 seconds to ensure session is processed
      await new Promise(resolve => setTimeout(resolve, 5000));
      
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
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={handleStartStreaming}
                      disabled={!sessionName.trim()}
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