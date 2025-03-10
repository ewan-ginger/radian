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

interface OrientationData {
  timestamp: number;
  x: number;
  y: number;
  z: number;
}

interface OrientationGraphProps {
  data: OrientationData[];
  title: string;
  maxPoints?: number;
}

export function OrientationGraph({ 
  data, 
  title, 
  maxPoints = 100 
}: OrientationGraphProps) {
  const [visibleData, setVisibleData] = useState<OrientationData[]>([]);

  // Update visible data when data changes
  useEffect(() => {
    if (data.length <= maxPoints) {
      setVisibleData(data);
    } else {
      // Show only the most recent data points
      setVisibleData(data.slice(data.length - maxPoints));
    }
  }, [data, maxPoints]);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={visibleData}
              margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="timestamp" 
                label={{ value: 'Time', position: 'insideBottomRight', offset: -10 }}
                tickFormatter={(value) => `${(value / 1000).toFixed(1)}s`}
              />
              <YAxis />
              <Tooltip 
                formatter={(value, name) => [`${value.toFixed(2)}°`, name]}
                labelFormatter={(label) => `Time: ${(label / 1000).toFixed(2)}s`}
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