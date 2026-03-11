import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'game-bg': '#0d0f1a',
        'game-surface': '#141726',
        'game-card': '#1a1f35',
        'game-border': '#2a3050',
        'game-accent': '#ffd700',
        'game-accent2': '#c084fc',
        'provider-openai': '#10b981',
        'provider-anthropic': '#f97316',
        'provider-gemini': '#3b82f6',
        'provider-groq': '#8b5cf6',
        'provider-ollama': '#6b7280',
        'provider-claude-cookie': '#ef4444',
      },
      fontFamily: {
        'pixel': ['"Press Start 2P"', 'monospace'],
        'game': ['"Rajdhani"', 'sans-serif'],
      },
      boxShadow: {
        'card-glow': '0 0 20px rgba(255, 215, 0, 0.3)',
        'card-glow-blue': '0 0 20px rgba(59, 130, 246, 0.4)',
        'card-glow-purple': '0 0 20px rgba(192, 132, 252, 0.4)',
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'thinking': 'thinking 1.4s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        thinking: {
          '0%, 80%, 100%': { opacity: '0' },
          '40%': { opacity: '1' },
        },
        glow: {
          'from': { boxShadow: '0 0 5px rgba(255, 215, 0, 0.2)' },
          'to': { boxShadow: '0 0 20px rgba(255, 215, 0, 0.6)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
