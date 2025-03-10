import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export const metadata = {
  title: 'Players - Radian',
  description: 'Manage player profiles and view performance data',
};

export default function PlayersPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-green-500" />
          <h1 className="text-3xl font-bold tracking-tight">Players</h1>
        </div>
        
        <p className="text-lg text-muted-foreground">
          Manage player profiles and view their performance data.
        </p>
        
        <Card>
          <CardHeader>
            <CardTitle>Player Management</CardTitle>
            <CardDescription>
              View and manage player information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Player information components will be implemented in Step 11.
            </p>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
} 