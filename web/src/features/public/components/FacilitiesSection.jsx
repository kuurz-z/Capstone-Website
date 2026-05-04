import { useState, useEffect, useRef } from "react";
import {
  Droplets,
  Coffee,
  Monitor,
  Users,
  Sofa,
  Building2,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import gfSeatingArea from "../../../assets/images/facilities/G_F seating area.jpg";
import gfElevatorLobby from "../../../assets/images/facilities/G_F elevator lobby.jpg";
import rdLoungeArea from "../../../assets/images/facilities/RD Lounge Area.jpg";
import rdLoungeArea2 from "../../../assets/images/facilities/RD Lounge Area 2.jpg";
import quadDoubleCommonCr2 from "../../../assets/images/facilities/Quad & double Common CR2.jpg";
import quadDoubleCommonCr from "../../../assets/images/facilities/Quad & double Common CR.jpg";
import loungeCommon from "../../../assets/images/facilities/Lounge common.jpg";
import gfSecurityCounter from "../../../assets/images/facilities/G_F security counter.jpg";

const facilities = [
  {
    icon: Droplets,
    title: "Modern Wash Area",
    description: "Spacious shared sinks with bright lighting and clean finishes.",
    image: quadDoubleCommonCr,
  },
  {
    icon: Coffee,
    title: "Pantry Lounge",
    description: "Cafe-style seating area with city views for meals and downtime.",
    image: rdLoungeArea,
  },
  {
    icon: Monitor,
    title: "Window Bar Seating",
    description: "High-table corner beside wide windows for study or laptop work.",
    image: rdLoungeArea2,
  },
  {
    icon: Building2,
    title: "Elevator Lobby",
    description: "Well-designed elevator access with clean interiors and warm accents.",
    image: gfElevatorLobby,
  },
  {
    icon: Sofa,
    title: "Ground Floor Lounge",
    description: "Open common area with lounge tables and indoor greenery.",
    image: gfSeatingArea,
    imagePosition: "center 70%",
  },
  {
    icon: Coffee,
    title: "Reception Counter",
    description: "Assistance desk ready to support inquiries and daily concerns.",
    image: gfSecurityCounter,
  },
  {
    icon: ShieldCheck,
    title: "Private Toilet Cubicles",
    description: "Neat and well-maintained cubicles for comfort and privacy.",
    image: quadDoubleCommonCr2,
  },
];

export function FacilitiesSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const autoplayRef = useRef(null);

  // Auto-play carousel
  useEffect(() => {
    autoplayRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % facilities.length);
    }, 5500); // 5.5 seconds

    return () => clearInterval(autoplayRef.current);
  }, []);

  // Reset autoplay on manual interaction
  const resetAutoplay = () => {
    clearInterval(autoplayRef.current);
    autoplayRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % facilities.length);
    }, 5500);
  };

  const goToSlide = (index) => {
    setCurrentIndex(index);
    resetAutoplay();
  };

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % facilities.length);
    resetAutoplay();
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + facilities.length) % facilities.length);
    resetAutoplay();
  };

  // Swipe handling
  const handleTouchStart = (e) => setTouchStart(e.targetTouches[0].clientX);
  const handleTouchEnd = (e) => {
    setTouchEnd(e.changedTouches[0].clientX);
    handleSwipe();
  };

  const handleSwipe = () => {
    if (touchStart - touchEnd > 50) {
      nextSlide();
    } else if (touchEnd - touchStart > 50) {
      prevSlide();
    }
  };

  const current = facilities[currentIndex];
  const Icon = current.icon;

  return (
    <section
      className="py-16 lg:py-20"
      style={{ backgroundColor: "var(--lp-bg)" }}
      id="facilities"
    >
      <div className="max-w-screen-2xl mx-auto px-8 lg:px-12">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-xs mb-3 tracking-widest uppercase font-medium" style={{ color: "var(--lp-accent)" }}>
            Shared Spaces
          </p>
          <h2 className="text-3xl lg:text-4xl font-medium mb-5 tracking-tight" style={{ color: "var(--lp-text)" }}>
            Facilities &amp; Amenities
          </h2>
          <p className="max-w-2xl mx-auto font-normal leading-relaxed" style={{ color: "var(--lp-text-secondary)" }}>
            A quick look at the actual shared spaces available in our building.
          </p>
        </div>

        {/* Slideshow Container */}
        <div
          className="relative rounded-3xl overflow-hidden mb-6 sm:mb-8 w-full max-w-5xl mx-auto aspect-[4/5] sm:aspect-[16/9]"
          style={{
            maxHeight: "500px",
            backgroundColor: "var(--lp-bg-card)",
            border: "1px solid var(--lp-border)",
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Slides */}
          {facilities.map((facility, index) => {
            const isActive = index === currentIndex;
            return (
              <div
                key={index}
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: isActive ? 1 : 0,
                  transition: "opacity 0.8s ease-in-out",
                  pointerEvents: isActive ? "auto" : "none",
                }}
              >
                {/* Background Image */}
                <ImageWithFallback
                  src={facility.image}
                  alt={facility.title}
                  className="w-full h-full object-cover"
                  style={{ objectPosition: facility.imagePosition || "center center" }}
                />
                {/* Dark Overlay */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: "linear-gradient(to top, rgba(10, 22, 40, 0.8) 0%, rgba(10, 22, 40, 0.4) 50%, transparent 100%)",
                  }}
                />

                {/* Content - Bottom Left */}
                <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-8 lg:p-12 z-10">
                  <div className="flex items-end gap-4 max-w-2xl">
                    {/* Icon Badge */}
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 hidden sm:flex"
                      style={{ backgroundColor: "rgba(212, 175, 55, 0.9)" }}
                    >
                      <Icon className="w-8 h-8 text-white" />
                    </div>

                    {/* Text */}
                    <div>
                      <h3 className="text-xl sm:text-2xl lg:text-3xl font-medium mb-1.5 sm:mb-2 text-white tracking-tight">
                        {facility.title}
                      </h3>
                      <p className="text-white/80 text-xs sm:text-sm lg:text-base font-light max-w-xl leading-relaxed">
                        {facility.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Navigation Arrows */}
          <button
            onClick={prevSlide}
            aria-label="Previous facility"
            className="absolute left-2 sm:left-4 top-1/2 transform -translate-y-1/2 z-20 p-1.5 sm:p-2 rounded-full transition-all duration-300 hover:scale-110"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.2)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(212, 175, 55, 0.8)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.2)")}
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </button>

          <button
            onClick={nextSlide}
            aria-label="Next facility"
            className="absolute right-2 sm:right-4 top-1/2 transform -translate-y-1/2 z-20 p-1.5 sm:p-2 rounded-full transition-all duration-300 hover:scale-110"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.2)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(212, 175, 55, 0.8)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.2)")}
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </button>
        </div>

        {/* Navigation Indicators */}
        <div className="flex justify-center items-center gap-2 sm:gap-3">
          {facilities.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className="transition-all duration-300"
              style={{
                width: index === currentIndex ? "24px" : "8px",
                height: "8px",
                borderRadius: "5px",
                backgroundColor: index === currentIndex ? "var(--lp-accent)" : "var(--lp-border)",
                border: "none",
                cursor: "pointer",
              }}
              aria-label={`Go to facility ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default FacilitiesSection;
