/**
 * @blueprint/design-tokens — Tailwind preset
 *
 * Consume from a Tailwind config:
 *
 *   import bcsPreset from '@blueprint/design-tokens/tailwind';
 *
 *   export default {
 *     presets: [bcsPreset],
 *     content: [
 *       './src/**\/*.{js,ts,jsx,tsx,svelte}',
 *       './node_modules/@blueprint/ui/dist/**\/*.{js,mjs}',
 *     ],
 *   };
 *
 * Color values reference CSS variables defined in @blueprint/design-tokens/css.
 * Always import that stylesheet at the root of any consuming app/surface:
 *
 *   import '@blueprint/design-tokens/css';
 */

/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT:    'oklch(var(--nino-brand-lch) / <alpha-value>)',
          background: 'oklch(var(--nino-brand-background-lch) / <alpha-value>)',
          foreground: 'oklch(var(--nino-brand-foreground-lch) / <alpha-value>)',
        },
        success: {
          DEFAULT:    'oklch(var(--nino-success-lch) / <alpha-value>)',
          background: 'oklch(var(--nino-success-background-lch) / <alpha-value>)',
          foreground: 'oklch(var(--nino-success-foreground-lch) / <alpha-value>)',
        },
        error: {
          DEFAULT:    'oklch(var(--nino-error-lch) / <alpha-value>)',
          background: 'oklch(var(--nino-error-background-lch) / <alpha-value>)',
          foreground: 'oklch(var(--nino-error-foreground-lch) / <alpha-value>)',
        },
        warning: {
          DEFAULT:    'oklch(var(--nino-warning-lch) / <alpha-value>)',
          background: 'oklch(var(--nino-warning-background-lch) / <alpha-value>)',
          foreground: 'oklch(var(--nino-warning-foreground-lch) / <alpha-value>)',
        },
        info: {
          DEFAULT:    'oklch(var(--nino-info-lch) / <alpha-value>)',
          background: 'oklch(var(--nino-info-background-lch) / <alpha-value>)',
          foreground: 'oklch(var(--nino-info-foreground-lch) / <alpha-value>)',
        },
        background: 'oklch(var(--nino-background-lch) / <alpha-value>)',
        foreground: 'oklch(var(--nino-foreground-lch) / <alpha-value>)',
        contrast: {
          100: 'oklch(var(--nino-contrast-100-lch) / <alpha-value>)',
          200: 'oklch(var(--nino-contrast-200-lch) / <alpha-value>)',
          300: 'oklch(var(--nino-contrast-300-lch) / <alpha-value>)',
          400: 'oklch(var(--nino-contrast-400-lch) / <alpha-value>)',
          500: 'oklch(var(--nino-contrast-500-lch) / <alpha-value>)',
        },
      },
      fontFamily: {
        heading: 'var(--nino-font-heading)',
        body:    'var(--nino-font-body)',
        mono:    'var(--nino-font-mono)',
      },
      fontSize: {
        xs:   ['0.75rem',  { lineHeight: '1.125rem' }],
        sm:   ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem',     { lineHeight: '1.5rem' }],
        lg:   ['1.125rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],
        xl:   ['1.25rem',  { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],
        '2xl': ['1.5rem',   { lineHeight: '2rem',    letterSpacing: '-0.015em' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em' }],
        '4xl': ['2.5rem',   { lineHeight: '2.75rem', letterSpacing: '-0.022em' }],
        '5xl': ['3rem',     { lineHeight: '3.25rem', letterSpacing: '-0.025em' }],
        '6xl': ['3.75rem',  { lineHeight: '4rem',    letterSpacing: '-0.028em' }],
        '7xl': ['4.5rem',   { lineHeight: '1',       letterSpacing: '-0.032em' }],
        '8xl': ['6rem',     { lineHeight: '1',       letterSpacing: '-0.035em' }],
      },
      borderRadius: {
        xs:  '0.25rem',
        sm:  '0.375rem',
        md:  '0.5rem',
        lg:  '0.75rem',
        xl:  '1rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        sm: 'var(--nino-shadow-sm)',
        md: 'var(--nino-shadow-md)',
        lg: 'var(--nino-shadow-lg)',
        xl: 'var(--nino-shadow-xl)',
      },
      transitionDuration: {
        instant:    '100ms',
        fast:       '150ms',
        normal:     '200ms',
        slow:       '300ms',
        deliberate: '500ms',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
        decel:    'cubic-bezier(0, 0, 0.2, 1)',
        accel:    'cubic-bezier(0.4, 0, 1, 1)',
        spring:   'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
};
