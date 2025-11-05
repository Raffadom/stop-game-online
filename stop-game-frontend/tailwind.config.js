// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // <--- Adicione esta linha
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      spacing: {
        '6': '1rem', // Override p-6 to use 1rem instead of 1.5rem
      },
    },
  },
  plugins: [],
}