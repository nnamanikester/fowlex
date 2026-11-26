import type { Config } from "tailwindcss";

// Placeholder theme with the Fowlex brand colours (brand/README.md).
// Step 1.2 replaces this with the Pickriders design tokens, re-coloured to these values.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        fowlex: {
          red: "#BA2234",
          charcoal: "#0E212A",
          cream: "#FBF6EE",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
