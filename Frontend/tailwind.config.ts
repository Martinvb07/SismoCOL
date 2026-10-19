import type { Config } from 'tailwindcss';

/** Color definido como tripleta RGB en index.css: cambia con el tema claro/oscuro. */
const token = (nombre: string) => `rgb(var(--c-${nombre}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tokens de marca de SismoCol (valores en src/index.css)
        fondo: token('fondo'),
        superficie: { DEFAULT: token('superficie'), 2: token('superficie-2'), 3: token('superficie-3') },
        primario: { DEFAULT: token('primario'), oscuro: token('primario-oscuro'), claro: token('primario-claro') },
        tinta: { DEFAULT: token('tinta'), secundaria: token('tinta-secundaria'), tenue: token('tinta-tenue') },
        borde: token('borde'),
        peligro: { DEFAULT: token('peligro'), fondo: token('peligro-fondo'), borde: token('peligro-borde'), texto: token('peligro-texto') },
        aviso: { fondo: token('aviso-fondo'), borde: token('aviso-borde'), texto: token('aviso-texto') },
        exito: { fondo: token('exito-fondo'), borde: token('exito-borde'), texto: token('exito-texto') },
        neutro: token('neutro'),
      },
      fontFamily: {
        sans: ['Inter', '"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        tarjeta: 'var(--sombra)',
        elevada: 'var(--sombra-elevada)',
      },
      keyframes: {
        vibrar: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-2px) rotate(-3deg)' },
          '75%': { transform: 'translateX(2px) rotate(3deg)' },
        },
        entrada: { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'none' } },
        aparecer: { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        vibrar: 'vibrar 0.12s linear infinite',
        entrada: 'entrada .4s cubic-bezier(.2,.7,.2,1) both',
        aparecer: 'aparecer .3s ease both',
      },
    },
  },
  plugins: [],
} satisfies Config;
