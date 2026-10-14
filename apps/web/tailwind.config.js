/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A0A0F",
        panel: "#12121A",
        line: "#23232E",
        cy: "#22B6F4",
        blu: "#3B6FE0",
        pur: "#8B3FEE",
        mut: "#9CA3AF",
      },
      fontFamily: {
        disp: ["Space Grotesk", "Inter", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
