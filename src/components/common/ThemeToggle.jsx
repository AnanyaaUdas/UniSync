// the sun / moon button in the bottom right corner for light and dark mode.
// the saved choice is applied in index.html before the page loads
import React, { useEffect, useState } from 'react';
import Icon from './Icon';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'light');
  const dark = theme === 'dark';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('unisync-theme', theme);
  }, [theme]);

  return (
    <button
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className="theme-toggle btn fixed z-[35] right-4 bottom-4 sm:right-6 sm:bottom-6 w-12 h-12 rounded-full grid place-items-center shadow-lg border line"
      style={{ background: 'var(--panel)', color: dark ? '#fcd34d' : '#4f46e5' }}
    >
      <Icon name={dark ? 'sun' : 'moon'} size={22} />
    </button>
  );
}
