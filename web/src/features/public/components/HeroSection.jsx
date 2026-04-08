import { Sparkles, Users, MapPin, ThumbsUp, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import hero1 from "../../../assets/images/hero1.jpg";
import hero2 from "../../../assets/images/hero2.jpg";
import hero3 from "../../../assets/images/hero3.jpg";


const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.8, delay, ease: [0.25, 0.1, 0.25, 1] },
});

/* Animated counter — always replays on scroll, easeOut curve */
function useCounter(target, duration = 2, isInView) {
  const [count, setCount] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isInView) { setCount(0); setDone(false); return; }

    const startTime = performance.now();
    const ms = duration * 1000;
    const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

    function tick(now) {
      const progress = Math.min((now - startTime) / ms, 1);
      setCount(Math.round(easeOutQuart(progress) * target));
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        setCount(target); setDone(true);
      }
    }
    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isInView, target, duration]);

  return { count, done };
}

const stats = [
  { icon: Users, value: 100, suffix: "+", label: "Happy Residents" },
  { icon: MapPin, value: 2, suffix: "", label: "Branches" },
  { icon: ThumbsUp, value: 98, suffix: "%", label: "Satisfaction Rate" },
];

const heroImages = [
  hero1,
  hero2,
  hero3,
];

export function HeroSection() {
  const { theme } = useTheme();
  const statRef = useRef(null);
  const isInView = useInView(statRef, { margin: "-50px" });
  const [currentImage, setCurrentImage] = useState(0);
  const [readyToZoom, setReadyToZoom] = useState(() =>
    heroImages.map((_, i) => i === 0 ? false : true)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImage((prev) => (prev + 1) % heroImages.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // When currentImage changes: start zoom on active, delay-reset others
  useEffect(() => {
    // Active image starts zooming (readyToZoom false = scale(1))
    setReadyToZoom((prev) => {
      const next = [...prev];
      next[currentImage] = false;
      return next;
    });

    // After fade-out completes (1.5s + buffer), silently reset inactive images
    const timeout = setTimeout(() => {
      setReadyToZoom((prev) => {
        const next = [...prev];
        for (let i = 0; i < next.length; i++) {
          if (i !== currentImage) next[i] = true;
        }
        return next;
      });
    }, 2000);

    return () => clearTimeout(timeout);
  }, [currentImage]);

  const resolvedTheme =
    theme === "system"
      ? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
  const isDark = resolvedTheme === "dark";

  const heroOverlay = isDark
    ? "linear-gradient(to right, rgba(8, 17, 31, 0.93) 0%, rgba(8, 17, 31, 0.82) 45%, rgba(8, 17, 31, 0.58) 75%, rgba(8, 17, 31, 0.45) 100%)"
    : "linear-gradient(to right, rgba(255, 255, 255, 0.9) 0%, rgba(243, 230, 184, 0.82) 45%, rgba(232, 211, 146, 0.52) 75%, rgba(212, 175, 55, 0.28) 100%)";

  const heroTextPrimary = isDark ? "white" : "var(--lp-navy)";
  const heroTextSecondary = isDark ? "rgba(255,255,255,0.8)" : "#111111";
  const heroTextMuted = isDark ? "rgba(255,255,255,0.6)" : "#1f2937";

  return (
    <>
      {/* Full-bleed Hero */}
      <section className="relative h-screen overflow-hidden flex items-center">
        {/* Background Slideshow */}
        {heroImages.map((src, i) => (
          <div
            key={i}
            className="absolute inset-0"
            style={{
              opacity: currentImage === i ? 1 : 0,
              transition: "opacity 1.5s ease-in-out",
            }}
          >
            <img
              src={src}
              alt={`Lilycrest Dormitory ${i + 1}`}
              className="w-full h-full object-cover"
              style={{
                objectPosition: "center 68%",
                transform: readyToZoom[i] ? "scale(1.08)" : "scale(1)",
                transition: readyToZoom[i] ? "none" : "transform 7s ease-out",
              }}
            />
          </div>
        ))}

        {/* Dark overlay for text readability */}
        <div
          className="absolute inset-0"
          style={{
            background: heroOverlay,
          }}
        />

        {/* Content */}
        <div className="relative z-10 max-w-screen-2xl mx-auto px-8 lg:px-12 w-full">
          <div className="max-w-2xl pt-12 lg:pt-15">
            {/* Badge */}
            <motion.div
              {...fadeUp(0.2)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-sm mb-6"
              style={{
                backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(10,22,40,0.06)",
              }}
            >
              <Sparkles className="w-4 h-4" style={{ color: isDark ? "rgba(255,255,255,0.9)" : "var(--lp-accent)" }} />
              <span className="text-xs font-light tracking-wider uppercase" style={{ color: heroTextSecondary }}>
                Quality Urban Living
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              {...fadeUp(0.4)}
              className="text-5xl lg:text-7xl font-medium leading-[1.08] mb-6 tracking-tight"
              style={{ color: heroTextPrimary }}
            >
              Affordable, Safe,{" "}
              <span className="block">and Comfortable</span>
              <span style={{ color: "var(--lp-accent)" }}>Dormitory</span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              {...fadeUp(0.6)}
              className="text-lg mb-10 leading-relaxed font-light max-w-lg"
              style={{ color: heroTextSecondary }}
            >
              Browse available rooms, create your account, and find your perfect
              home away from home.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div {...fadeUp(0.8)} className="flex flex-wrap gap-4 mb-6">
              <Link to="/applicant/check-availability">
                <button
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-medium text-base transition-all duration-300"
                  style={{
                    color: isDark ? "white" : "var(--lp-navy)",
                    backgroundColor: "var(--lp-accent)",
                    boxShadow: "0 4px 20px rgba(212, 175, 55, 0.25)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow =
                      "0 6px 30px rgba(212, 175, 55, 0.4)";
                    e.currentTarget.style.transform =
                      "translateY(-2px) scale(1.02)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow =
                      "0 4px 20px rgba(212, 175, 55, 0.25)";
                    e.currentTarget.style.transform = "translateY(0) scale(1)";
                  }}
                >
                  Browse Available Rooms
                  <ArrowRight className="w-5 h-5" />
                </button>
              </Link>
              <a
                href="#inquiry"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-medium text-base transition-all duration-300"
                style={{
                  border: isDark ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(10,22,40,0.2)",
                  color: heroTextPrimary,
                  backgroundColor: "transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(10,22,40,0.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                Contact Us
              </a>
            </motion.div>

            {/* Reassurance */}
            <motion.p
              {...fadeUp(0.95)}
              className="text-sm font-normal mb-6"
              style={{ color: heroTextMuted }}
            >
              ✓ No hidden fees · ✓ Flexible terms · ✓ Visit first, decide later
            </motion.p>

            {/* Stats — enhanced glassmorphism strip */}
            <motion.div
              {...fadeUp(1.1)}
              ref={statRef}
              className="inline-flex items-center gap-0 flex-wrap"
              style={{
                background: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.55)",
                backdropFilter: "blur(12px)",
                border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(10,22,40,0.12)",
                borderRadius: "50px",
                padding: "10px 20px",
              }}
            >
              {stats.map((stat, i) => {
                const Icon = stat.icon;
                return (
                  <div key={i} className="flex items-center">
                    {i > 0 && (
                      <div
                        className="mx-4 hidden sm:block"
                        style={{
                          width: '1px',
                          height: '24px',
                          backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(10,22,40,0.18)',
                        }}
                      />
                    )}
                    <StatItem
                      icon={Icon}
                      target={stat.value}
                      suffix={stat.suffix}
                      label={stat.label}
                      isInView={isInView}
                      delay={i * 0.15}
                    />
                  </div>
                );
              })}
            </motion.div>
          </div>
        </div>

        {/* Slide Indicators — right side */}
        <div
          className="absolute z-10 hidden md:flex flex-col items-center gap-3"
          style={{ right: "48px", top: "50%", transform: "translateY(-50%)" }}
        >
          {heroImages.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentImage(i)}
              aria-label={`Go to slide ${i + 1}`}
              style={{
                width: "2px",
                height: currentImage === i ? "32px" : "20px",
                borderRadius: "1px",
                backgroundColor: currentImage === i
                  ? (isDark ? "white" : "var(--lp-navy)")
                  : (isDark ? "rgba(255,255,255,0.35)" : "rgba(10,22,40,0.35)"),
                border: "none",
                cursor: "pointer",
                transition: "all 0.4s ease",
                padding: 0,
              }}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function StatItem({ icon: Icon, target, suffix, label, isInView, delay }) {
  const { theme } = useTheme();
  const { count, done } = useCounter(target, 2, isInView);

  const resolvedTheme =
    theme === "system"
      ? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
  const isDark = resolvedTheme === "dark";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className="flex items-center gap-2"
    >
      <Icon className="w-4 h-4" style={{ color: "var(--lp-accent)" }} />
      <motion.span
        animate={done ? { scale: [1, 1.15, 1] } : {}}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="text-lg font-medium inline-block"
        style={{ color: done ? 'var(--lp-accent)' : (isDark ? 'white' : 'var(--lp-navy)'), transition: 'color 0.5s ease' }}
      >
        {count}{suffix}
      </motion.span>
      <span className="text-sm font-light" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#1f2937' }}>{label}</span>
    </motion.div>
  );
}
