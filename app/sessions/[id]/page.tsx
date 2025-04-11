"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OrientationGraph } from '@/components/data/OrientationGraph';
import { AccelerationGraph } from '@/components/data/AccelerationGraph';
import { GyroscopeGraph } from '@/components/data/GyroscopeGraph';
import { MagnetometerGraph } from '@/components/data/MagnetometerGraph';
import { Badge } from '@/components/ui/badge';
import { Activity, Calendar, Clock, Database } from 'lucide-react';
import { useSessionData } from '@/hooks/useSessionData';
import { getSensorDataBySession } from '@/lib/services/sensor-data-service';
import { SensorDataEntity } from '@/types/database.types';
import { formatDistanceToNow, format } from 'date-fns';

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const { sessions, getSessionSummary } = useSessionData();
  const [session, setSession] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sensorData, setSensorData] = useState<SensorDataEntity[]>([]);
  const [dataType, setDataType] = useState('orientation');
  
  useEffect(() => {
    const fetchSessionData = async () => {
      setIsLoading(true);
      try {
        // Find session in the list
        const sessionData = sessions.find(s => s.id === sessionId);
        if (sessionData) {
          setSession(sessionData);
          
          // Get session summary
          const summaryData = await getSessionSummary(sessionId);
          setSummary(summaryData);
          
          // Get sensor data
          const data = await getSensorDataBySession(sessionId);
          console.log('Fetched sensor data:', {
            count: data.length,
            firstFew: data.slice(0, 3),
            lastFew: data.slice(-3)
          });
          
          // Check if we have valid timestamps
          if (data.length > 0) {
            const hasValidTimestamps = data.every(item => 
              item.timestamp !== undefined && item.timestamp !== null
            );
            console.log('All data points have valid timestamps:', hasValidTimestamps);
            
            // Check the type of timestamp
            const firstTimestamp = data[0].timestamp;
            console.log('First timestamp type:', typeof firstTimestamp, 'Value:', firstTimestamp);
          }
          
          setSensorData(data);
        }
      } catch (error) {
        console.error('Error fetching session data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    if (sessionId && sessions.length > 0) {
      fetchSessionData();
    }
  }, [sessionId, sessions, getSessionSummary]);
  
  // Format the duration from interval string to human readable format
  const formatDuration = (duration: string | null) => {
    if (!duration) {
      // If no duration is set, calculate it from start_time to now or end_time
      if (session) {
        const startTime = new Date(session.start_time);
        const endTime = session.end_time ? new Date(session.end_time) : new Date();
        const durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
        
        const hours = Math.floor(durationSeconds / 3600);
        const minutes = Math.floor((durationSeconds % 3600) / 60);
        const seconds = durationSeconds % 60;
        
        if (hours > 0) {
          return `${hours} hours ${minutes} minutes`;
        } else if (minutes > 0) {
          return `${minutes} minutes ${seconds} seconds`;
        } else {
          return `${seconds} seconds`;
        }
      }
      return 'N/A';
    }
    
    // Check if duration is in HH:MM:SS format
    const timeFormatMatch = duration.match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (timeFormatMatch) {
      const hours = parseInt(timeFormatMatch[1]);
      const minutes = parseInt(timeFormatMatch[2]);
      const seconds = parseInt(timeFormatMatch[3]);
      
      if (hours > 0) {
        return `${hours} hours ${minutes} minutes`;
      } else if (minutes > 0) {
        return `${minutes} minutes ${seconds} seconds`;
      } else {
        return `${seconds} seconds`;
      }
    }
    
    // Try to extract hours, minutes, seconds from PostgreSQL interval format
    try {
      // This is a simple parser for interval format like "1 hour 30 minutes 45 seconds"
      const hours = duration.match(/(\d+)\s+hour/i)?.[1] || '0';
      const minutes = duration.match(/(\d+)\s+minute/i)?.[1] || '0';
      const seconds = duration.match(/(\d+)\s+second/i)?.[1] || '0';
      
      if (parseInt(hours) > 0) {
        return `${hours} hours ${minutes} minutes`;
      } else if (parseInt(minutes) > 0) {
        return `${minutes} minutes ${seconds} seconds`;
      } else {
        return `${seconds} seconds`;
      }
    } catch (e) {
      // Alternative approach: if the duration is just a number of seconds
      if (typeof duration === 'string' && !isNaN(Number(duration))) {
        const totalSeconds = parseInt(duration);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        if (hours > 0) {
          return `${hours} hours ${minutes} minutes`;
        } else if (minutes > 0) {
          return `${minutes} minutes ${seconds} seconds`;
        } else {
          return `${seconds} seconds`;
        }
      }
      
      return 'N/A';
    }
  };
  
  // Transform sensor data for the graph
  const transformDataForGraph = (data: SensorDataEntity[], type: string) => {
    // Log the first few data points to see what we're working with
    if (data.length > 0) {
      console.log(`First few ${type} data points:`, data.slice(0, 3));
    } else {
      console.log(`No ${type} data points available`);
      return []; // Return empty array if no data
    }

    // Filter out any data points with invalid timestamps
    const validData = data.filter(item => 
      item.timestamp !== undefined && 
      item.timestamp !== null
    );
    
    if (validData.length === 0) {
      console.log(`No valid ${type} data points with timestamps`);
      return []; // Return empty array if no valid data
    }
    
    console.log(`Valid ${type} data points: ${validData.length} out of ${data.length}`);

    // Ensure data is sorted by timestamp
    const sortedData = [...validData].sort((a, b) => {
      const aTime = typeof a.timestamp === 'number' ? a.timestamp : Number(a.timestamp);
      const bTime = typeof b.timestamp === 'number' ? b.timestamp : Number(b.timestamp);
      return aTime - bTime;
    });
    
    const transformedData = sortedData.map((item) => {
      // Use the original timestamp value directly
      // Make sure it's a number
      const timestamp = typeof item.timestamp === 'number' 
        ? item.timestamp 
        : Number(item.timestamp);
      
      switch (type) {
        case 'orientation':
          return {
            timestamp: timestamp,
            x: item.orientation_x || 0,
            y: item.orientation_y || 0,
            z: item.orientation_z || 0,
          };
        case 'accelerometer':
          return {
            timestamp: timestamp,
            x: item.accelerometer_x || 0,
            y: item.accelerometer_y || 0,
            z: item.accelerometer_z || 0,
          };
        case 'gyroscope':
          return {
            timestamp: timestamp,
            x: item.gyroscope_x || 0,
            y: item.gyroscope_y || 0,
            z: item.gyroscope_z || 0,
          };
        case 'magnetometer':
          return {
            timestamp: timestamp,
            x: item.magnetometer_x || 0,
            y: item.magnetometer_y || 0,
            z: item.magnetometer_z || 0,
          };
        default:
          return {
            timestamp: timestamp,
            x: 0,
            y: 0,
            z: 0,
          };
      }
    });
    
    // Log the first few transformed data points
    if (transformedData.length > 0) {
      console.log(`First few transformed ${type} data points:`, transformedData.slice(0, 3));
      console.log(`Last few transformed ${type} data points:`, transformedData.slice(-3));
    }
    
    return transformedData;
  };
  
  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </MainLayout>
    );
  }
  
  if (!session) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold">Session not found</h2>
          <p className="text-muted-foreground mt-2">The session you're looking for doesn't exist or has been deleted.</p>
        </div>
      </MainLayout>
    );
  }
  
  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {session.name || `Session ${session.id.substring(0, 8)}`}
          </h1>
          <div className="flex flex-wrap gap-3 mt-2">
            <Badge variant="outline" className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(session.start_time), 'PPP')}
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(new Date(session.start_time), 'p')}
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <Activity className="h-3 w-3" />
              {formatDuration(session.duration)}
            </Badge>
            {summary && (
              <>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  {summary.dataPointsCount} data points
                </Badge>
                {summary.sessionType && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    {summary.sessionType.replace(/_/g, ' ')}
                  </Badge>
                )}
              </>
            )}
          </div>
          
          {summary && summary.players && summary.players.length > 0 && (
            <div className="mt-2">
              <h3 className="text-sm font-medium text-muted-foreground">Players:</h3>
              <div className="flex flex-wrap gap-2 mt-1">
                {summary.players.map((player, index) => (
                  <Badge key={index} variant="secondary">
                    {player}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Session Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs defaultValue="orientation" value={dataType} onValueChange={setDataType}>
              <TabsList className="grid grid-cols-4">
                <TabsTrigger value="orientation">Orientation</TabsTrigger>
                <TabsTrigger value="accelerometer">Accelerometer</TabsTrigger>
                <TabsTrigger value="gyroscope">Gyroscope</TabsTrigger>
                <TabsTrigger value="magnetometer">Magnetometer</TabsTrigger>
              </TabsList>
              
              <TabsContent value="orientation">
                {sensorData.length > 0 ? (
                  <OrientationGraph 
                    data={transformDataForGraph(sensorData, 'orientation')} 
                    title="Orientation (degrees)" 
                    maxPoints={1000}
                  />
                ) : (
                  <div className="flex items-center justify-center h-[300px] border rounded-md">
                    <p className="text-muted-foreground">No orientation data available</p>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="accelerometer">
                {sensorData.length > 0 ? (
                  <AccelerationGraph 
                    data={transformDataForGraph(sensorData, 'accelerometer')} 
                    title="Accelerometer (m/s²)" 
                    maxPoints={1000}
                  />
                ) : (
                  <div className="flex items-center justify-center h-[300px] border rounded-md">
                    <p className="text-muted-foreground">No accelerometer data available</p>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="gyroscope">
                {sensorData.length > 0 ? (
                  <GyroscopeGraph 
                    data={transformDataForGraph(sensorData, 'gyroscope')} 
                    title="Gyroscope (deg/s)" 
                    maxPoints={1000}
                  />
                ) : (
                  <div className="flex items-center justify-center h-[300px] border rounded-md">
                    <p className="text-muted-foreground">No gyroscope data available</p>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="magnetometer">
                {sensorData.length > 0 ? (
                  <MagnetometerGraph 
                    data={transformDataForGraph(sensorData, 'magnetometer')} 
                    title="Magnetometer (μT)" 
                    maxPoints={1000}
                  />
                ) : (
                  <div className="flex items-center justify-center h-[300px] border rounded-md">
                    <p className="text-muted-foreground">No magnetometer data available</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
} 