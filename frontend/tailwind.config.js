/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Windows 11 Fluent Design colors
        'primary': '#0078d4',
        'primary-light': '#0063b1',
        'primary-dark': '#005a9e',
        'surface': '#f3f3f3',
        'surface-2': '#ebebeb',
        'surface-3': '#ffffff',
        'text-primary': '#000000',
        'text-secondary': '#424242',
        'divider': '#e1e1e1',
        'accent': '#3f8fd9',
        
        // Dark mode colors
        'dark-surface': '#202020',
        'dark-surface-2': '#2d2d2d',
        'dark-surface-3': '#3d3d3d',
        'dark-text-primary': '#ffffff',
        'dark-text-secondary': '#e1e1e1',
      },
      fontFamily: {
        'sans': ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      backdropBlur: {
        'xl': '20px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-subtle': 'pulseSubtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '.8' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
