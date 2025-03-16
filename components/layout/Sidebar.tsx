"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PanelLeft, PanelRight, Plus, Activity } from 'lucide-react';
import { useSessionData } from '@/hooks/useSessionData';
import { formatDistanceToNow } from 'date-fns';
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { SupabaseStatusPill } from "@/components/ui/SupabaseStatusPill";

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(true);
  const { sessions, isLoading } = useSessionData();
  const pathname = usePathname();

  // Log sessions to see duration values
  useEffect(() => {
    if (sessions.length > 0) {
      console.log('Sessions with durations:', sessions.map(s => ({
        id: s.id,
        name: s.name,
        duration: s.duration
      })));
    }
  }, [sessions]);

  // Format the duration from interval string to human readable format
  const formatDuration = (duration: string | null) => {
    if (!duration) {
      // If no duration is set, calculate it from start_time to now
      return 'N/A';
    }
    
    console.log('Formatting duration:', duration);
    
    // Check if duration is in HH:MM:SS format
    const timeFormatMatch = duration.match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (timeFormatMatch) {
      const hours = parseInt(timeFormatMatch[1]);
      const minutes = parseInt(timeFormatMatch[2]);
      const seconds = parseInt(timeFormatMatch[3]);
      
      console.log('Parsed time format duration:', { hours, minutes, seconds });
      
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
      } else {
        return `${seconds}s`;
      }
    }
    
    // Try to extract hours, minutes, seconds from PostgreSQL interval format
    try {
      // This is a simple parser for interval format like "1 hour 30 minutes 45 seconds"
      const hours = duration.match(/(\d+)\s+hour/i)?.[1] || '0';
      const minutes = duration.match(/(\d+)\s+minute/i)?.[1] || '0';
      const seconds = duration.match(/(\d+)\s+second/i)?.[1] || '0';
      
      console.log('Parsed text format duration:', { hours, minutes, seconds });
      
      if (parseInt(hours) > 0) {
        return `${hours}h ${minutes}m`;
      } else if (parseInt(minutes) > 0) {
        return `${minutes}m ${seconds}s`;
      } else {
        return `${seconds}s`;
      }
    } catch (e) {
      console.error('Error parsing duration:', e);
      
      // Alternative approach: if the duration is just a number of seconds
      if (typeof duration === 'string' && !isNaN(Number(duration))) {
        const totalSeconds = parseInt(duration);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        if (hours > 0) {
          return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
          return `${minutes}m ${seconds}s`;
        } else {
          return `${seconds}s`;
        }
      }
      
      return 'N/A';
    }
  };

  // Calculate duration for sessions without a duration field
  const calculateDuration = (session: any) => {
    if (session.duration) {
      return formatDuration(session.duration);
    }
    
    // If no duration but has end_time, calculate from start_time to end_time
    if (session.end_time) {
      const startTime = new Date(session.start_time);
      const endTime = new Date(session.end_time);
      const durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
      
      const hours = Math.floor(durationSeconds / 3600);
      const minutes = Math.floor((durationSeconds % 3600) / 60);
      const seconds = durationSeconds % 60;
      
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
      } else {
        return `${seconds}s`;
      }
    }
    
    // If no end_time, show as ongoing
    return 'Ongoing';
  };

  return (
    <div className={`relative h-screen border-r transition-all duration-300 ${isOpen ? 'w-64' : 'w-16'}`}>
      <div className="flex flex-col h-full">
        {/* Sidebar Header with Logo and Toggle */}
        <div className="p-4 border-b flex items-center justify-between">
          {isOpen ? (
            <>
              <span className="font-bold text-xl">Radian</span>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsOpen(false)}
                className="ml-2"
              >
                <PanelLeft size={18} />
              </Button>
            </>
          ) : (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsOpen(true)}
              className="mx-auto"
            >
              <PanelRight size={18} />
            </Button>
          )}
        </div>
        
        {/* New Session Button */}
        <div className="p-4 border-b">
          {isOpen ? (
            <Link href="/devices">
              <Button className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                New Session
              </Button>
            </Link>
          ) : (
            <Link href="/devices">
              <Button size="icon" className="w-full">
                <Plus className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
        
        {/* Sessions List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {isOpen && (
              <h3 className="px-2 py-1 text-sm font-medium text-muted-foreground">Recent Sessions</h3>
            )}
            
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : sessions.length === 0 ? (
              isOpen && (
                <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                  No sessions found
                </div>
              )
            ) : (
              sessions.map((session) => {
                const isActive = pathname === `/sessions/${session.id}`;
                return (
                  <Link 
                    key={session.id} 
                    href={`/sessions/${session.id}`}
                    className={`block px-2 py-2 rounded-md text-sm transition-colors ${
                      isActive 
                        ? 'bg-primary/10 text-primary' 
                        : 'hover:bg-muted'
                    }`}
                  >
                    {isOpen ? (
                      <>
                        <div className="font-medium truncate">
                          {session.name || `Session ${session.id.substring(0, 8)}`}
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>{formatDistanceToNow(new Date(session.start_time), { addSuffix: true })}</span>
                          <span className="flex items-center">
                            <Activity className="h-3 w-3 mr-1" />
                            {calculateDuration(session)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-center">
                        <Activity className={`h-5 w-5 ${isActive ? 'text-primary' : ''}`} />
                      </div>
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </ScrollArea>
        
        {/* Sidebar Footer with Theme Toggle and Supabase Status */}
        <div className="p-4 border-t">
          {isOpen ? (
            <div className="flex items-center justify-between">
              <SupabaseStatusPill />
              <ThemeToggle />
            </div>
          ) : (
            <div className="flex justify-center">
              <ThemeToggle />
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 