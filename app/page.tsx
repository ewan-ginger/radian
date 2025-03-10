import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseStatus } from "@/components/ui/SupabaseStatus";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Database, ArrowRight, Laptop, Users, BarChart3 } from "lucide-react";

export default function Home() {
  const featureCards = [
    {
      title: "Device Connection",
      description: "Connect to ESP32 devices",
      content: "Connect to your ESP32 device using Web Serial API to start collecting data.",
      icon: <Laptop className="h-5 w-5 text-blue-500" />,
      href: "/devices"
    },
    {
      title: "Player Data",
      description: "View player information",
      content: "Manage player profiles and view their performance data.",
      icon: <Users className="h-5 w-5 text-green-500" />,
      href: "/players"
    },
    {
      title: "Data Visualization",
      description: "Analyze movement data",
      content: "Visualize player movement data in real-time with interactive graphs.",
      icon: <BarChart3 className="h-5 w-5 text-red-500" />,
      href: "/visualization"
    }
  ];

  return (
    <MainLayout>
      <section className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Sports Analytics Dashboard
          </h1>
          <p className="text-lg text-muted-foreground">
            Real-time tracking and visualization of player movement data
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featureCards.map((card, index) => (
            <Card key={index} className="overflow-hidden">
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                {card.icon}
                <div>
                  <CardTitle>{card.title}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pb-6">
                <p className="text-muted-foreground mb-4">
                  {card.content}
                </p>
                <Link href={card.href} passHref>
                  <Button variant="outline" className="w-full">
                    Go to {card.title}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      
      <section className="mt-16">
        <div className="space-y-2 mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Database Connection</h2>
          <p className="text-muted-foreground">
            Connect to Supabase to store and retrieve data
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div>
            <SupabaseStatus />
            <p className="mt-4 text-sm text-muted-foreground">
              To configure Supabase, create a project at <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="underline">supabase.com</a> and update your .env.local file with your project credentials.
            </p>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Database Schema Setup</CardTitle>
              <CardDescription>Create the required database tables</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                After connecting to Supabase, you need to set up the database schema to store player information, session data, and sensor readings.
              </p>
              <Link href="/database" passHref>
                <Button className="w-full">
                  <Database className="mr-2 h-4 w-4" />
                  Set up Database Schema
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
    </MainLayout>
  );
}
