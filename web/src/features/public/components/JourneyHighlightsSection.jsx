import { ArrowRight, BedDouble, MapPinned, MessageSquareMore } from "lucide-react";
import { Link } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

const STEPS = [
  {
    step: "01",
    title: "Browse the rooms that fit your budget",
    body: "Start with availability, room type, and branch so visitors can narrow choices quickly instead of reading the whole site first.",
    href: "#rooms",
    cta: "See room options",
    icon: BedDouble,
  },
  {
    step: "02",
    title: "Check location and shared amenities",
    body: "Compare the branch, nearby schools, and common spaces before committing to an inquiry.",
    href: "#location",
    cta: "Review locations",
    icon: MapPinned,
  },
  {
    step: "03",
    title: "Start an inquiry with the details already in mind",
    body: "Move directly into the contact flow once room fit and location are clear, with one consistent next step.",
    href: "#inquiry",
    cta: "Start inquiry",
    icon: MessageSquareMore,
  },
];

export function JourneyHighlightsSection() {
  const { theme } = useTheme();
  const resolvedTheme =
    theme === "system"
      ? typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  const isDark = resolvedTheme === "dark";

  return (
    <section
      className="py-16 lg:py-20"
      style={{
        background:
          isDark
            ? "linear-gradient(180deg, rgba(11, 22, 40, 0.92), rgba(8, 17, 31, 1))"
            : "linear-gradient(180deg, rgba(247, 244, 234, 0.76), rgba(255, 255, 255, 1))",
        borderBottom: "1px solid var(--lp-border)",
      }}
    >
      <div className="max-w-screen-2xl mx-auto px-8 lg:px-12">
        <div className="grid gap-8 xl:grid-cols-[1.1fr_1.7fr] xl:items-start">
          <div className="max-w-md">
            <span
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em]"
              style={{
                color: "var(--lp-accent)",
                backgroundColor: "var(--lp-icon-bg)",
                border: "1px solid var(--lp-border)",
              }}
            >
              Easier Decision Path
            </span>
            <h2
              className="mt-5 text-3xl font-medium tracking-tight lg:text-4xl"
              style={{ color: "var(--lp-text)" }}
            >
              A clearer route from first visit to room inquiry.
            </h2>
            <p
              className="mt-4 text-base leading-7"
              style={{ color: "var(--lp-text-secondary)" }}
            >
              Lilycrest now guides visitors through room fit, branch confidence,
              and inquiry intent in a tighter sequence instead of a long,
              section-by-section scroll.
            </p>

            <div
              className="mt-8 rounded-[28px] p-6"
              style={{
                backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "#ffffff",
                border: "1px solid var(--lp-border)",
                boxShadow: "var(--lp-card-shadow)",
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div
                    className="text-xs font-semibold uppercase tracking-[0.2em]"
                    style={{ color: "var(--lp-text-muted)" }}
                  >
                    Dominant Action
                  </div>
                  <div
                    className="mt-2 text-xl font-medium"
                    style={{ color: "var(--lp-text)" }}
                  >
                    Browse rooms first
                  </div>
                </div>
                <Link
                  to="/applicant/check-availability"
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold no-underline"
                  style={{
                    color: isDark ? "#08111F" : "#0A1628",
                    backgroundColor: "var(--lp-accent)",
                  }}
                >
                  Explore now
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.step}
                  href={item.href}
                  className="group rounded-[28px] p-6 no-underline transition-transform duration-300 hover:-translate-y-1"
                  style={{
                    backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "#ffffff",
                    border: "1px solid var(--lp-border)",
                    boxShadow: "var(--lp-card-shadow)",
                  }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <span
                      className="text-xs font-semibold tracking-[0.24em]"
                      style={{ color: "var(--lp-text-muted)" }}
                    >
                      {item.step}
                    </span>
                    <span
                      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: "var(--lp-icon-bg)", color: "var(--lp-accent)" }}
                    >
                      <Icon size={18} />
                    </span>
                  </div>

                  <h3
                    className="mt-10 text-xl font-medium leading-8"
                    style={{ color: "var(--lp-text)" }}
                  >
                    {item.title}
                  </h3>
                  <p
                    className="mt-4 text-sm leading-7"
                    style={{ color: "var(--lp-text-secondary)" }}
                  >
                    {item.body}
                  </p>

                  <span
                    className="mt-8 inline-flex items-center gap-2 text-sm font-semibold"
                    style={{ color: "var(--lp-accent)" }}
                  >
                    {item.cta}
                    <ArrowRight
                      size={15}
                      className="transition-transform duration-300 group-hover:translate-x-1"
                    />
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export default JourneyHighlightsSection;
