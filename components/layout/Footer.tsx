"use client";

import Link from "next/link";
import { Github } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();
  
  const footerLinks = [
    { href: "/about", label: "About" },
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <footer className="border-t bg-background mt-auto">
      <div className="container py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Logo and Description */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold">Radian</span>
              <span className="text-sm text-muted-foreground">Sports Analytics</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-md">
              Real-time tracking and visualization of player movement data collected from ESP32 devices via the Web Serial API.
            </p>
          </div>
          
          {/* Links */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Links</h3>
            <nav className="flex flex-col gap-2">
              {footerLinks.map((link) => (
                <Link 
                  key={link.href} 
                  href={link.href} 
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          
          {/* Social and Tech */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Connect</h3>
            <div className="flex items-center gap-4">
              <a 
                href="https://github.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="GitHub"
              >
                <Github className="h-5 w-5" />
              </a>
            </div>
            <div className="text-xs text-muted-foreground mt-8">
              <p>Built with Next.js, Shadcn UI, and Supabase</p>
            </div>
          </div>
        </div>
        
        {/* Copyright */}
        <div className="border-t mt-8 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-muted-foreground">
            &copy; {currentYear} Radian Sports Analytics. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            <Link href="/" className="hover:underline">
              Dashboard
            </Link>
            {" • "}
            <Link href="/devices" className="hover:underline">
              Devices
            </Link>
            {" • "}
            <Link href="/players" className="hover:underline">
              Players
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
} 