'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { SessionManager } from '@/lib/data/session-manager';
import { getPlayers } from '@/lib/data/data-storage';
import { PlayerEntity } from '@/types/database.types';

interface UseDataRecordingOptions {
  autoSelectPlayer?: boolean;
  bufferSize?: number;
  flushInterval?: number;
}

interface UseDataRecordingResult {
  isRecording: boolean;
  sessionId: string | null;
  playerId: string | null;
  players: PlayerEntity[];
  recordingDuration: number;
  dataPoints: number;
  startRecording: (sessionName?: string) => Promise<boolean>;
  stopRecording: () => Promise<boolean>;
  setPlayer: (playerId: string) => void;
  addDataPoint: (data: number[]) => Promise<boolean>;
}

/**
 * Hook for managing data recording state
 * @param options Recording options
 * @returns Recording state and methods
 */
export function useDataRecording({
  autoSelectPlayer = true,
  bufferSize = 50,
  flushInterval = 5000
}: UseDataRecordingOptions = {}): UseDataRecordingResult {
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerEntity[]>([]);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [dataPoints, setDataPoints] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  
  const sessionManagerRef = useRef<SessionManager | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Initialize session manager
  useEffect(() => {
    sessionManagerRef.current = new SessionManager(playerId, bufferSize, flushInterval);
    
    return () => {
      // Clean up on unmount
      if (isRecording) {
        stopRecording();
      }
    };
  }, []);
  
  // Load players
  useEffect(() => {
    const loadPlayers = async () => {
      try {
        const playersList = await getPlayers();
        setPlayers(playersList);
        
        // Auto-select first player if enabled
        if (autoSelectPlayer && playersList.length > 0 && !playerId) {
          setPlayerId(playersList[0].id);
          if (sessionManagerRef.current) {
            sessionManagerRef.current.setPlayerId(playersList[0].id);
          }
        }
      } catch (error) {
        console.error('Error loading players:', error);
      }
    };
    
    loadPlayers();
  }, [autoSelectPlayer]);
  
  // Update recording duration
  useEffect(() => {
    if (isRecording && startTime) {
      durationIntervalRef.current = setInterval(() => {
        const duration = Math.floor((Date.now() - startTime) / 1000);
        setRecordingDuration(duration);
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }
    
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    };
  }, [isRecording, startTime]);
  
  // Set player ID
  const setPlayer = useCallback((id: string) => {
    setPlayerId(id);
    if (sessionManagerRef.current) {
      sessionManagerRef.current.setPlayerId(id);
    }
  }, []);
  
  // Start recording
  const startRecording = useCallback(async (sessionName?: string): Promise<boolean> => {
    if (!sessionManagerRef.current) {
      console.error('Session manager not initialized');
      return false;
    }
    
    try {
      console.log('Starting recording session with name:', sessionName);
      const id = await sessionManagerRef.current.startSession(sessionName);
      setSessionId(id);
      setIsRecording(true);
      setStartTime(Date.now());
      setDataPoints(0);
      setRecordingDuration(0);
      console.log('Recording session started with ID:', id);
      return true;
    } catch (error) {
      console.error('Error starting recording:', error);
      return false;
    }
  }, []);
  
  // Stop recording
  const stopRecording = useCallback(async (): Promise<boolean> => {
    if (!sessionManagerRef.current || !isRecording) {
      return false;
    }
    
    try {
      console.log('Stopping recording session');
      await sessionManagerRef.current.endSession();
      setIsRecording(false);
      setStartTime(null);
      console.log('Recording session stopped');
      return true;
    } catch (error) {
      console.error('Error stopping recording:', error);
      return false;
    }
  }, [isRecording]);
  
  // Add data point
  const addDataPoint = useCallback(async (data: number[]): Promise<boolean> => {
    if (!sessionManagerRef.current) {
      console.log('Cannot add data point: No session manager');
      return false;
    }
    
    // Check if we need to start a session first
    if (!isRecording) {
      try {
        console.log('Received data but no active session. Starting a default session...');
        const defaultName = `Auto-Session-${new Date().toISOString().replace(/[:.]/g, '-')}`;
        await startRecording(defaultName);
      } catch (error) {
        console.error('Failed to auto-start session:', error);
        return false;
      }
    }
    
    try {
      console.log('Adding data point to session manager:', data);
      const result = await sessionManagerRef.current.addSensorData(data);
      console.log('Result from session manager addSensorData:', result);
      
      if (result) {
        console.log('Incrementing data points counter');
        setDataPoints(prev => {
          const newCount = prev + 1;
          console.log('New data points count:', newCount);
          return newCount;
        });
      } else {
        console.log('Not incrementing counter - addSensorData returned false');
      }
      
      return result;
    } catch (error) {
      console.error('Error adding data point:', error);
      return false;
    }
  }, [isRecording, startRecording]);
  
  return {
    isRecording,
    sessionId,
    playerId,
    players,
    recordingDuration,
    dataPoints,
    startRecording,
    stopRecording,
    setPlayer,
    addDataPoint
  };
} 