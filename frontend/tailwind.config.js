/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#eef4ff", 100: "#dbe6fe", 500: "#3b6ef6", 600: "#2f5ae0", 700: "#2749b8", 900: "#1a2f6b" },
        ink: { 900: "#0f172a", 700: "#334155", 500: "#64748b" },
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
