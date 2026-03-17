import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Maria Santos",
    role: "Young Professional",
    initials: "MS",
    quote:
      "Lilycrest made my transition so easy. The room was move-in ready and the WiFi is reliable for both work and streaming.",
    rating: 5,
  },
  {
    name: "James Reyes",
    role: "Working Professional",
    initials: "JR",
    quote:
      "I compared 5 places before choosing Lilycrest. Best value for money — all utilities included, no surprise charges.",
    rating: 5,
  },
  {
    name: "Angela Cruz",
    role: "Long-term Resident",
    initials: "AC",
    quote:
      "The community here is amazing. I've made lifelong friends, and the 24/7 security gives my family peace of mind.",
    rating: 5,
  },
  {
    name: "Carlos Mendoza",
    role: "New Resident",
    initials: "CM",
    quote:
      "Moving in was completely stress-free. Everything was furnished and ready to go. I was settled in on the same day.",
    rating: 5,
  },
  {
    name: "Patricia Lim",
    role: "Remote Worker",
    initials: "PL",
    quote:
      "Stable internet and a quiet environment — exactly what I needed for remote work. The flexible contract terms are a huge plus.",
    rating: 5,
  },
  {
    name: "David Tan",
    role: "Long-term Resident",
    initials: "DT",
    quote:
      "I've been here for 2 years and I honestly can't picture living anywhere else. The management is responsive and the community is great.",
    rating: 5,
  },
];

// Triple the array for seamless loop on wide viewports
const marqueeItems = [...testimonials, ...testimonials, ...testimonials];

function TestimonialCard({ t }) {
  return (
    <div
      className="flex-shrink-0 w-[360px] rounded-2xl p-7 transition-all duration-300 hover:-translate-y-2 cursor-default"
      style={{
        backgroundColor: "var(--lp-bg-card)",
        border: "1px solid var(--lp-border)",
        boxShadow: "var(--lp-card-shadow)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "var(--lp-card-shadow-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "var(--lp-card-shadow)";
      }}
    >
      {/* Stars */}
      <div className="flex gap-1 mb-5">
        {Array.from({ length: t.rating }).map((_, j) => (
          <Star
            key={j}
            className="w-4 h-4 fill-current"
            style={{ color: "#FF8C42" }}
          />
        ))}
      </div>

      {/* Quote */}
      <p
        className="leading-relaxed mb-6 font-light text-[15px]"
        style={{ color: "var(--lp-text-secondary)" }}
      >
        "{t.quote}"
      </p>

      {/* Author */}
      <div
        className="flex items-center gap-3 pt-5"
        style={{ borderTop: "1px solid var(--lp-border)" }}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium"
          style={{ backgroundColor: "var(--lp-accent)" }}
        >
          {t.initials}
        </div>
        <div>
          <p
            className="text-sm font-medium"
            style={{ color: "var(--lp-text)" }}
          >
            {t.name}
          </p>
          <p
            className="text-xs font-light"
            style={{ color: "var(--lp-text-muted)" }}
          >
            {t.role}
          </p>
        </div>
      </div>
    </div>
  );
}

export function SocialProofSection() {
  return (
    <section
      className="py-16 lg:py-20 overflow-hidden"
      style={{ backgroundColor: "var(--lp-bg)" }}
    >
      <div className="max-w-screen-2xl mx-auto px-8 lg:px-12">
        {/* Header */}
        <div className="text-center mb-14">
          <p
            className="text-xs mb-3 tracking-widest uppercase font-medium"
            style={{ color: "var(--lp-accent)" }}
          >
            What Our Residents Say
          </p>
          <h2
            className="text-3xl lg:text-4xl font-medium mb-5 tracking-tight"
            style={{ color: "var(--lp-text)" }}
          >
            Trusted by Our Community
          </h2>
          <p
            className="max-w-2xl mx-auto font-light leading-relaxed"
            style={{ color: "var(--lp-text-secondary)" }}
          >
            Real stories from the people who call Lilycrest home.
          </p>
        </div>
      </div>

      {/* Marquee — slides sideways, pauses on hover */}
      <div className="relative group">
        {/* Left/right fade edges */}
        <div
          className="absolute left-0 top-0 bottom-0 w-24 z-10 pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, var(--lp-bg), transparent)",
          }}
        />
        <div
          className="absolute right-0 top-0 bottom-0 w-24 z-10 pointer-events-none"
          style={{
            background:
              "linear-gradient(to left, var(--lp-bg), transparent)",
          }}
        />

        <div
          className="lp-marquee-track flex gap-8 py-4"
          style={{
            animation: "marquee-scroll 55s linear infinite",
            width: "max-content",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.animationPlayState = "paused";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.animationPlayState = "running";
          }}
        >
          {marqueeItems.map((t, i) => (
            <TestimonialCard key={i} t={t} />
          ))}
        </div>
      </div>

      {/* Keyframes injected via style tag */}
      <style>{`
        @keyframes marquee-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .lp-marquee-track { animation: none !important; }
        }
      `}</style>
    </section>
  );
}

export default SocialProofSection;
