/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        note: {
          yellow: '#fff9c4',
          'yellow-dark': '#f9f5b8',
          pink: '#f8bbd9',
          'pink-dark': '#f1a5cc',
          blue: '#bbdefb',
          'blue-dark': '#a5d4f7',
          green: '#c8e6c9',
          'green-dark': '#b8dbb9',
        },
      },
      boxShadow: {
        note: '0 4px 12px rgba(0, 0, 0, 0.15)',
        'note-hover': '0 6px 16px rgba(0, 0, 0, 0.2)',
      },
    },
  },
  plugins: [],
};
