import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#121212",
        surface: "rgba(255,255,255,0.06)",
        border: "rgba(255,255,255,0.10)",
        "text-primary": "#FFFFFF",
        "text-secondary": "rgba(255,255,255,0.60)",
        "text-tertiary": "rgba(255,255,255,0.35)",
        genre: {
          rnb: "#6A0DAD",
          neosoul: "#FF914D",
          hiphop: "#1DB9FF",
          chillpop: "#FF6FAE",
          lofi: "#4DB6AC",
          nujazz: "#FFD93D",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
