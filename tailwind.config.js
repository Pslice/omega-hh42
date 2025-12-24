/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js}"],
  theme: {
    extend: {
      textShadow: {
        'outline': '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff',
      },
    },
  },
  plugins: [
    require('tailwindcss'),
    require('autoprefixer'),
    function ({ addUtilities }) {
      const newUtilities = {
        '.text-outline': {
          'text-shadow': '-0.2px -0.2px 1px #fff, 0.2px -0.2px 1px #fff, -0.2px 0.2px 1px #fff, 0.2px 0.2px 1px #fff',
        },
      }
      addUtilities(newUtilities)
    },
  ],
}