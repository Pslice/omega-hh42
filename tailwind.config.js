/** @type {import('tailwindcss').Config} */
module.exports = {
  // renderer.js toggles utility classes at runtime, so JS files must be
  // scanned too or those classes get purged from the build.
  content: ["./src/**/*.{html,js}"],
  theme: {
    extend: {},
  },
  // `tailwindcss` and `autoprefixer` are PostCSS plugins, not Tailwind
  // plugins; listing them here (as this file used to) made Tailwind try to
  // load itself as one of its own extensions.
  plugins: [],
};
