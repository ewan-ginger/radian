"use client";

import { useState, useEffect } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MagnetometerData {
  timestamp: number;
  x: number;
  y: number;
  z: number;
}

interface MagnetometerGraphProps {
  data: MagnetometerData[];
  title: string;
  maxPoints?: number;
}

export function MagnetometerGraph({ 
  data, 
  title, 
  maxPoints = 100 
}: MagnetometerGraphProps) {
  const [visibleData, setVisibleData] = useState<MagnetometerData[]>([]);

  // Update visible data when data changes
  useEffect(() => {
    if (data.length <= maxPoints) {
      setVisibleData(data);
    } else {
      // Show only the most recent data points
      setVisibleData(data.slice(data.length - maxPoints));
    }
  }, [data, maxPoints]);

  // Format the timestamp for display
  const formatTimestamp = (timestamp: number) => {
    // Ensure timestamp is a number
    const numericTimestamp = Number(timestamp);
    if (isNaN(numericTimestamp)) {
      console.warn('Invalid timestamp value:', timestamp);
      return '0.0';
    }
    return numericTimestamp.toFixed(1);
  };

  // Format the timestamp for tooltip
  const formatTooltipTimestamp = (timestamp: number) => {
    // Ensure timestamp is a number
    const numericTimestamp = Number(timestamp);
    if (isNaN(numericTimestamp)) {
      console.warn('Invalid tooltip timestamp value:', timestamp);
      return 'Time: 0.0s';
    }
    return `Time: ${numericTimestamp.toFixed(1)}s`;
  };

  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={visibleData}
              margin={{
                top: 30,
                right: 30,
                left: 30,
                bottom: 10,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="timestamp" 
                label={{ value: 'Time (s)', position: 'insideBottomRight', offset: -10 }}
                tickFormatter={formatTimestamp}
                domain={['dataMin', 'dataMax']}
                type="number"
                allowDecimals={true}
                allowDataOverflow={false}
              />
              <YAxis 
                label={{ value: 'Magnetic Field (μT)', angle: -90, position: 'insideLeft', offset: -15, dy: 50 }}
                width={60}
              />
              <Tooltip 
                formatter={(value, name) => [`${value.toFixed(2)} μT`, name]}
                labelFormatter={formatTooltipTimestamp}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="x" 
                stroke="#8884d8" 
                name="X-Axis" 
                dot={false}
                activeDot={{ r: 8 }}
              />
              <Line 
                type="monotone" 
                dataKey="y" 
                stroke="#82ca9d" 
                name="Y-Axis" 
                dot={false}
                activeDot={{ r: 8 }}
              />
              <Line 
                type="monotone" 
                dataKey="z" 
                stroke="#ff7300" 
                name="Z-Axis" 
                dot={false}
                activeDot={{ r: 8 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
} 