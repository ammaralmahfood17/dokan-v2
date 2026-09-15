'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

function getInitialDarkMode() {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('dark-mode') === 'true';
}

export default function ThemeToggle() {
  // Lazy initializer reads localStorage synchronously on first render —
  // avoids the setState-in-effect cascading render (and the FOUC that caused).
  const [darkMode, setDarkMode] = useState(getInitialDarkMode);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const toggle = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('dark-mode', String(newMode));
  };

  return (
    <button
      onClick={toggle}
      className="fixed bottom-4 right-4 z-50 p-2 rounded-full bg-muted hover:bg-muted/80 transition-colors"
      aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {darkMode ? <Sun className="h-4 w-4 text-muted-foreground" /> : <Moon className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}