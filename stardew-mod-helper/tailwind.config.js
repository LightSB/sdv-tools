/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          400: '#86C96B',
          500: '#5FAE57',
          600: '#3F8F42',
        },
        accent: {
          400: '#E8C46A',
          500: '#D9A441',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          raised: '#FDFBF4',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          "'SF Pro Text'",
          "'PingFang SC'",
          "'Microsoft YaHei'",
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 8px 24px -12px rgba(63, 143, 66, 0.18)',
      },
    },
  },
  plugins: [],
};
