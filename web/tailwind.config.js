/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background:  "var(--background)",
        foreground:  "var(--foreground)",
        card: {
          DEFAULT:    "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT:    "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        muted: {
          DEFAULT:    "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        border:           "var(--border)",
        input:            "var(--input)",
        ring:             "var(--ring)",
        primary: {
          DEFAULT:        "var(--primary)",
          foreground:     "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT:        "var(--secondary)",
          foreground:     "var(--secondary-foreground)",
        },
        accent: {
          DEFAULT:        "var(--accent)",
          foreground:     "var(--accent-foreground)",
        },
        success: {
          DEFAULT:        "var(--success)",
          foreground:     "var(--success-foreground)",
          light:          "var(--success-light)",
          dark:           "var(--success-dark)",
        },
        warning: {
          DEFAULT:        "var(--warning)",
          foreground:     "var(--warning-foreground)",
          light:          "var(--warning-light)",
          dark:           "var(--warning-dark)",
        },
        danger: {
          DEFAULT:        "var(--danger)",
          foreground:     "var(--danger-foreground)",
          light:          "var(--danger-light)",
          dark:           "var(--danger-dark)",
        },
        error: {
          DEFAULT:        "var(--error)",
          foreground:     "var(--error-foreground)",
          light:          "var(--error-light)",
          dark:           "var(--error-dark)",
        },
        info: {
          DEFAULT:        "var(--info)",
          foreground:     "var(--info-foreground)",
          light:          "var(--info-light)",
          dark:           "var(--info-dark)",
        },
        neutral: {
          DEFAULT:        "var(--neutral)",
          foreground:     "var(--neutral-foreground)",
          light:          "var(--neutral-light)",
          dark:           "var(--neutral-dark)",
        },
        sidebar: {
          DEFAULT:        "var(--card)",
          foreground:     "var(--foreground)",
          primary:        "var(--primary)",
          "primary-foreground": "var(--primary-foreground)",
          accent:         "var(--accent)",
          "accent-foreground":  "var(--accent-foreground)",
          border:         "var(--border)",
          ring:           "var(--ring)",
        },
        "chart-1":        "var(--chart-1)",
        "chart-2":        "var(--chart-2)",
        "chart-3":        "var(--chart-3)",
        "chart-4":        "var(--chart-4)",
        "chart-5":        "var(--chart-5)",
      },
      borderRadius: {
        sm:  "calc(var(--radius) - 4px)",
        md:  "calc(var(--radius) - 2px)",
        lg:  "var(--radius)",
        xl:  "calc(var(--radius) + 4px)",
      },
    },
  },
  plugins: [],
}