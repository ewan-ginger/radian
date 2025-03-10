"use client";

import { MainLayout } from "@/components/layout/MainLayout";
import { SimpleDeviceConnection } from "@/components/devices/SimpleDeviceConnection";
import { DataDisplay } from "@/components/data/DataDisplay";
import { RecordingProvider } from "@/context/RecordingContext";

export default function Home() {
  return (
    <RecordingProvider>
      <MainLayout>
        <div className="w-full max-w-4xl mx-auto py-8 space-y-8">
          <SimpleDeviceConnection />
          <DataDisplay />
        </div>
      </MainLayout>
    </RecordingProvider>
  );
}
