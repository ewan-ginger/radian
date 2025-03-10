import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseStatus } from "@/components/ui/SupabaseStatus";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 container py-8">
        <h1 className="text-4xl font-bold mb-8">Sports Analytics Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Device Connection</CardTitle>
              <CardDescription>Connect to ESP32 devices</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Connect to your ESP32 device using Web Serial API to start collecting data.
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Player Data</CardTitle>
              <CardDescription>View player information</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Manage player profiles and view their performance data.
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Data Visualization</CardTitle>
              <CardDescription>Analyze movement data</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Visualize player movement data in real-time with interactive graphs.
              </p>
            </CardContent>
          </Card>
        </div>
        
        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-4">Database Connection</h2>
          <div className="max-w-md">
            <SupabaseStatus />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            To configure Supabase, create a project at <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="underline">supabase.com</a> and update your .env.local file with your project credentials.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
