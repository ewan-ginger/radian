"use client";

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OrientationGraph } from '@/components/data/OrientationGraph';
import { AccelerationGraph } from '@/components/data/AccelerationGraph';
import { GyroscopeGraph } from '@/components/data/GyroscopeGraph';
import { MagnetometerGraph } from '@/components/data/MagnetometerGraph';
import { Badge } from '@/components/ui/badge';
import { Activity, Calendar, Clock, Database, User, Wifi } from 'lucide-react';
import { useSessionData } from '@/hooks/useSessionData';
import { getSensorDataBySession } from '@/lib/services/sensor-data-service';
import { getSessionPlayersBySessionId } from '@/lib/services/session-player-service';
import { SensorDataEntity, SessionPlayerEntity, SessionType, getRequiredPlayers } from '@/types/database.types';
import { formatDistanceToNow, format } from 'date-fns';
import { formatSessionType } from '@/lib/utils';

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const { sessions } = useSessionData();
  const [session, setSession] = useState<SessionEntity | null>(null);
  const [sessionPlayers, setSessionPlayers] = useState<SessionPlayerEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sensorData, setSensorData] = useState<SensorDataEntity[]>([]);
  const [dataType, setDataType] = useState('orientation');
  
  useEffect(() => {
    const fetchPageData = async () => {
      if (!sessionId) return;
      setIsLoading(true);
      try {
        // Find session in the main list (useSessionData)
        // TODO: Could fetch session directly by ID if not found in list
        const sessionData = sessions.find(s => s.id === sessionId);
        setSession(sessionData || null);
        
        if (sessionData) {
          // Get associated players/devices for this session
          const playersData = await getSessionPlayersBySessionId(sessionId);
          setSessionPlayers(playersData);
          console.log('Fetched Session Players:', playersData);
          
          // Get all sensor data for the session
          const data = await getSensorDataBySession(sessionId);
          console.log('Fetched sensor data:', {
            count: data.length,
            firstFew: data.slice(0, 3),
            lastFew: data.slice(-3)
          });
          setSensorData(data);
        } else {
            console.warn(`Session ${sessionId} not found in useSessionData list.`);
            setSessionPlayers([]);
            setSensorData([]);
        }

      } catch (error) {
        console.error('Error fetching session page data:', error);
        setSession(null);
        setSessionPlayers([]);
        setSensorData([]);
      } finally {
        setIsLoading(false);
      }
    };
    
    if (sessionId && sessions.length > 0) {
      fetchPageData();
    } else if (sessionId && sessions.length === 0) {
        // If sessions are not loaded yet, wait or fetch directly (simplified for now)
        console.log('Sessions list empty, page might load incompletely.');
        // Consider adding a direct fetch for session by ID here as fallback
    }
  }, [sessionId, sessions]); // Depend on sessions list loading
  
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
  
  // Memoize transformed data calculation per device
  const dataByDevice = useMemo(() => {
    const groupedData: { [deviceId: string]: SensorDataEntity[] } = {};
    
    sessionPlayers.forEach(player => {
        if (player.device_id) {
            groupedData[player.device_id] = [];
        }
    });

    sensorData.forEach(item => {
      if (item.device_id && groupedData[item.device_id]) {
        groupedData[item.device_id].push(item);
      }
    });

    console.log("Grouped sensor data by device:", groupedData);
    return groupedData;
  }, [sensorData, sessionPlayers]);

  // Transform sensor data for the graph (now accepts pre-filtered data)
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
      const timestamp = typeof item.timestamp === 'number' 
        ? item.timestamp 
        : Number(item.timestamp);
      
      switch (type) {
        case 'orientation': return { timestamp, x: item.orientation_x || 0, y: item.orientation_y || 0, z: item.orientation_z || 0 };
        case 'accelerometer': return { timestamp, x: item.accelerometer_x || 0, y: item.accelerometer_y || 0, z: item.accelerometer_z || 0 };
        case 'gyroscope': return { timestamp, x: item.gyroscope_x || 0, y: item.gyroscope_y || 0, z: item.gyroscope_z || 0 };
        case 'magnetometer': return { timestamp, x: item.magnetometer_x || 0, y: item.magnetometer_y || 0, z: item.magnetometer_z || 0 };
        default: return { timestamp, x: 0, y: 0, z: 0 };
      }
    });
    
    // Log the first few transformed data points
    if (transformedData.length > 0) {
      console.log(`First few transformed ${type} data points:`, transformedData.slice(0, 3));
      console.log(`Last few transformed ${type} data points:`, transformedData.slice(-3));
    }
    
    console.log(`Transformed ${type} data count: ${transformedData.length}`);
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
  
  // Determine number of players/devices
  const numberOfPlayers = sessionPlayers.length || getRequiredPlayers(session?.session_type);
  
  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {session?.name || `Session ${sessionId.substring(0, 8)}`}
          </h1>
          <div className="flex flex-wrap gap-2 mt-2">
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
             {session?.session_type && (
                <Badge variant="secondary" className="flex items-center gap-1">
                   <Activity className="h-3 w-3" />
                   {formatSessionType(session.session_type)}
                </Badge>
             )}
             <Badge variant="outline" className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {numberOfPlayers} Player{numberOfPlayers !== 1 ? 's' : ''}
             </Badge>
             <Badge variant="outline" className="flex items-center gap-1">
                 <Database className="h-3 w-3" />
                 {sensorData.length} Total Data Points
             </Badge>
          </div>
          
          {/* Display Player/Device List */}
          {sessionPlayers.length > 0 && (
            <div className="mt-4 p-3 border rounded bg-muted/30">
              <h3 className="text-sm font-medium mb-2">Participants:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {sessionPlayers.map((player, index) => (
                  <Badge key={index} variant="secondary" className="justify-start text-left h-auto py-1 px-2">
                     <User className="h-3 w-3 mr-1.5 flex-shrink-0"/> 
                     <span className="truncate font-medium mr-1.5">{player.playerName || `Player ${index + 1}`}</span>
                     <Wifi className="h-3 w-3 mr-1 flex-shrink-0 text-muted-foreground"/> 
                     <span className="text-xs text-muted-foreground">Dev {player.device_id || '?'}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Loop through players/devices to render graph sets */} 
        {sessionPlayers.map((player, index) => {
            const deviceId = player.device_id;
            // Get data specific to this device, fallback to empty array if no deviceId or no data
            const deviceSensorData = deviceId ? (dataByDevice[deviceId] || []) : [];
            
            return (
             <Card key={player.id || index} className="w-full">
               <CardHeader>
                 {/* Title per player/device */}
                 <CardTitle className="flex items-center gap-2">
                     <User className="h-4 w-4"/> {player.playerName || `Player ${index + 1}`}
                     <span className="text-sm font-normal text-muted-foreground">(Device ID: {deviceId || 'N/A'})</span>
                 </CardTitle>
               </CardHeader>
               <CardContent className="space-y-6">
                  {/* Check if this device has data before rendering tabs */}
                  {deviceSensorData.length > 0 ? (
                    <Tabs defaultValue="orientation" /* Consider separate state per player? Or link them? */ > 
                      <TabsList className="grid grid-cols-4">
                        <TabsTrigger value="orientation">Orientation</TabsTrigger>
                        <TabsTrigger value="accelerometer">Accelerometer</TabsTrigger>
                        <TabsTrigger value="gyroscope">Gyroscope</TabsTrigger>
                        <TabsTrigger value="magnetometer">Magnetometer</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="orientation">
                          <OrientationGraph 
                            data={transformDataForGraph(deviceSensorData, 'orientation')} 
                            title="Orientation (degrees)" 
                          />
                      </TabsContent>
                      <TabsContent value="accelerometer">
                          <AccelerationGraph 
                            data={transformDataForGraph(deviceSensorData, 'accelerometer')} 
                            title="Accelerometer (m/s²)" 
                          />
                      </TabsContent>
                       <TabsContent value="gyroscope">
                          <GyroscopeGraph 
                            data={transformDataForGraph(deviceSensorData, 'gyroscope')} 
                            title="Gyroscope (rad/s)" 
                          />
                      </TabsContent>
                      <TabsContent value="magnetometer">
                          <MagnetometerGraph 
                            data={transformDataForGraph(deviceSensorData, 'magnetometer')} 
                            title="Magnetometer (μT)" 
                          />
                      </TabsContent>
                    </Tabs>
                  ) : (
                    <div className="flex items-center justify-center h-[100px] border rounded-md">
                       <p className="text-muted-foreground">No sensor data recorded for this player/device.</p>
                    </div>
                  )}
               </CardContent>
             </Card>
            );
        })}

        {/* Show message if no players/devices were linked */} 
        {sessionPlayers.length === 0 && !isLoading && (
            <Card className="w-full">
                <CardContent className="pt-6">
                    <p className="text-muted-foreground text-center">No player or device data associated with this session.</p>
                </CardContent>
            </Card>
        )}

      </div>
    </MainLayout>
  );
} 