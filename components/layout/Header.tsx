"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Menu, X, Laptop, Users, BarChart3 } from "lucide-react";
import { useState } from "react";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const navItems = [
    { href: "/devices", label: "Devices", icon: <Laptop className="h-4 w-4 mr-2" /> },
    { href: "/players", label: "Players", icon: <Users className="h-4 w-4 mr-2" /> },
    { href: "/visualization", label: "Visualization", icon: <BarChart3 className="h-4 w-4 mr-2" /> },
  ];

  return (
    <header className="border-b bg-background sticky top-0 z-40">
      <div className="container flex h-16 items-center justify-between py-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-bold">Radian</span>
            <span className="text-sm text-muted-foreground hidden sm:inline">Sports Analytics</span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          {navItems.map((item) => (
            <Link 
              key={item.href} 
              href={item.href} 
              className="flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          
          {/* Mobile Menu Button */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden" 
            onClick={toggleMobileMenu}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t">
          <nav className="container py-4 flex flex-col gap-4">
            {navItems.map((item) => (
              <Link 
                key={item.href} 
                href={item.href} 
                className="flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors p-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
} 