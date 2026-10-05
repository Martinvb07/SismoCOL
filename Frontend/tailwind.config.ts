import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tokens de marca de SismoCol
        lateral: { DEFAULT: '#14323b', claro: '#1d4652', borde: '#2a5764' },
        fondo: '#f3f5f7',
        primario: { DEFAULT: '#1f8fa6', oscuro: '#176f81', claro: '#e3f3f6' },
        tinta: { DEFAULT: '#1b2a30', secundaria: '#4a5a61', tenue: '#5f6f75' },
        borde: '#dde3e7',
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      keyframes: {
        vibrar: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-2px) rotate(-3deg)' },
          '75%': { transform: 'translateX(2px) rotate(3deg)' },
        },
      },
      animation: { vibrar: 'vibrar 0.12s linear infinite' },
    },
  },
  plugins: [],
} satisfies Config;
