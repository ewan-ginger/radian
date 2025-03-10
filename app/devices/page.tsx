import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Laptop } from "lucide-react";

export const metadata = {
  title: 'Device Connection - Radian',
  description: 'Connect to ESP32 devices using Web Serial API',
};

export default function DevicesPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Laptop className="h-6 w-6 text-blue-500" />
          <h1 className="text-3xl font-bold tracking-tight">Device Connection</h1>
        </div>
        
        <p className="text-lg text-muted-foreground">
          Connect to ESP32 devices using Web Serial API to collect sensor data.
        </p>
        
        <Card>
          <CardHeader>
            <CardTitle>Connect to Device</CardTitle>
            <CardDescription>
              Select and connect to an ESP32 device
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Device connection interface will be implemented in Step 9.
            </p>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
} 