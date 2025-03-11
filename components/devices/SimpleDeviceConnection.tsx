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
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState('Disconnected');
  const [sensorData, setSensorData] = useState<string[]>([]);
  const [sessionName, setSessionName] = useState('');
  const [sessionNameError, setSessionNameError] = useState('');
  
  const { 
    isRecording, 
    recordingDuration, 
    dataPoints, 
    startRecording, 
    stopRecording, 
    addDataPoint,
    sessionId
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
  const validateSessionName = () => {
    if (!sessionName.trim()) {
      setSessionNameError('Please enter a session name');
      return false;
    }
    setSessionNameError('');
    return true;
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
            
            // Process all incoming data
            try {
              // Extract data values from the line
              // Format: DATA: playerID,timestamp,battery,orientX,orientY,orientZ,accelX,accelY,accelZ,gyroX,gyroY,gyroZ,magX,magY,magZ
              const dataStr = line.substring(5).trim(); // Remove 'DATA:' prefix and trim
              const values = dataStr.split(',').map(val => parseFloat(val.trim()));
              
              if (values.length >= 15) {
                // Log the values being sent to addDataPoint
                console.log('Adding data point to recording with values:', values);
                
                // Call addDataPoint with the parsed values
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
    if (!validateSessionName()) {
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
  
  async function handleStopStreaming() {
    if (!isConnected) {
      return;
    }
    
    try {
      // Send stop command to the device
      await sendCommand('stop');
      setIsStreaming(false);
      
      // Stop recording session
      console.log('Stopping recording session');
      await stopRecording();
      console.log('Recording stopped');
      
      // Clear session name
      setSessionName('');
    } catch (error) {
      console.error('Error stopping streaming:', error);
    }
  }
  
  async function handleReset() {
    if (!isConnected) {
      return;
    }
    
    try {
      await sendCommand('reset');
      setSensorData([]);
    } catch (error) {
      console.error('Error resetting device:', error);
    }
  }
  
  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Device Connection</CardTitle>
        <Badge className={isConnected ? "bg-green-500" : "bg-red-500"}>
          {status}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isConnected ? (
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
          <>
            <div className="flex flex-col space-y-4">
              {(isStreaming || isRecording) && (
                <div className="bg-muted p-3 rounded-md">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-sm font-medium">
                        Recording Session: {sessionName || `Session ${sessionId?.substring(0, 8) || ''}`}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        Duration: {formatDuration(recordingDuration)}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">
                        Data Points: {dataPoints}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="session-name">Session Name</Label>
                  <Input 
                    id="session-name" 
                    value={sessionName} 
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder="Enter a name for this session"
                    disabled={isStreaming || isRecording}
                  />
                  {sessionNameError && (
                    <p className="text-xs text-destructive">{sessionNameError}</p>
                  )}
                </div>
                
                <div>
                  <h3 className="text-sm font-medium mb-2">Device Control</h3>
                  <div className="flex flex-wrap gap-2">
                    {(isStreaming || isRecording) ? (
                      <Button 
                        variant="outline"
                        className="flex items-center gap-2"
                        onClick={handleStopStreaming}
                      >
                        <Pause className="h-4 w-4" />
                        Stop Session
                      </Button>
                    ) : (
                      <Button 
                        className="flex items-center gap-2"
                        onClick={handleStartStreaming}
                        disabled={!sessionName.trim()}
                      >
                        <Play className="h-4 w-4" />
                        Start Session
                      </Button>
                    )}
                    
                    <Button 
                      variant="outline" 
                      className="flex items-center gap-2"
                      onClick={handleReset}
                      disabled={isStreaming || isRecording}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Reset
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="flex items-center gap-2"
                      onClick={disconnectSerial}
                      disabled={isStreaming || isRecording}
                    >
                      <Usb className="h-4 w-4" />
                      Disconnect
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="mt-4">
                <h3 className="text-sm font-medium mb-2">Sensor Data</h3>
                <div className="bg-muted p-2 rounded-md h-40 overflow-y-auto text-xs font-mono">
                  {sensorData.length > 0 ? (
                    sensorData.map((line, index) => (
                      <div key={index} className="whitespace-pre-wrap">{line}</div>
                    ))
                  ) : (
                    <div className="text-muted-foreground">No data received yet</div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
} 