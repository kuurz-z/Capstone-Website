import { useState } from "react";
import {
  Wifi,
  Coffee,
  Utensils,
  Shirt,
  BookOpen,
  Users,
  Sofa,
  Dumbbell,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import SpotlightImage from "../../tenant/components/SpotlightImage";

const facilities = [
  {
    icon: Wifi,
    title: "High-Speed Wi-Fi",
    description: "100 Mbps fiber internet throughout the building for seamless browsing and streaming",
    image: "https://images.unsplash.com/photo-1588501360908-30d639a70964?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjB3aWZpJTIwaW50ZXJuZXQlMjBsb3VuZ2V8ZW58MXx8fHwxNzcwNDY1OTc0fDA&ixlib=rb-4.1.0&q=80&w=1080",
  },
  {
    icon: BookOpen,
    title: "Study Lounge",
    description: "Quiet, well-lit dedicated spaces perfect for focused studying and work",
    image: "https://images.unsplash.com/photo-1516042438821-0abd7a73c4b3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsaWJyYXJ5JTIwc3R1ZHklMjBsb3VuZ2UlMjBxdWlldHxlbnwxfHx8fDE3NzA0NjU5NzR8MA&ixlib=rb-4.1.0&q=80&w=1080",
  },
  {
    icon: Utensils,
    title: "Shared Kitchen",
    description: "Fully-equipped with stove, refrigerator, and cookware for preparing your meals",
    image: "https://images.unsplash.com/photo-1657084031100-6925483d8a7a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzaGFyZWQlMjBraXRjaGVuJTIwZG9ybWl0b3J5JTIwY29tbXVuYWx8ZW58MXx8fHwxNzcwNDY1OTc1fDA&ixlib=rb-4.1.0&q=80&w=1080",
  },
  {
    icon: Shirt,
    title: "Laundry Area",
    description: "Coin-operated washers and dryers available 24/7 for your convenience",
    image: "https://images.unsplash.com/photo-1758279745240-b75977c88fa8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsYXVuZHJ5JTIwcm9vbSUyMHdhc2hlcnMlMjBkcnllcnN8ZW58MXx8fHwxNzcwNDY1OTc1fDA&ixlib=rb-4.1.0&q=80&w=1080",
  },
  {
    icon: Sofa,
    title: "Common Lounge",
    description: "Comfortable shared space to relax, socialize, and connect with fellow residents",
    image: "https://images.unsplash.com/photo-1759038085939-2d32655d95ac?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb21tb24lMjBsb3VuZ2UlMjBzZWF0aW5nJTIwYXJlYXxlbnwxfHx8fDE3NzA0NjU5NzV8MA&ixlib=rb-4.1.0&q=80&w=1080",
  },
  {
    icon: Coffee,
    title: "Pantry Area",
    description: "Water dispenser, microwave, and dining tables for quick meals and refreshments",
    image: "https://images.unsplash.com/photo-1758977403341-0104135995af?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkaW5pbmclMjBhcmVhJTIwdGFibGUlMjBjaGFpcnN8ZW58MXx8fHwxNzcwNDY1OTc5fDA&ixlib=rb-4.1.0&q=80&w=1080",
  },
  {
    icon: Users,
    title: "Reception Desk",
    description: "Friendly staff available daily for assistance, inquiries, and 24/7 security",
    image: "https://images.unsplash.com/photo-1648960456182-00643d5d20eb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyZWNlcHRpb24lMjBkZXNrJTIwbG9iYnklMjBob3RlbHxlbnwxfHx8fDE3NzA0NjU5NzZ8MA&ixlib=rb-4.1.0&q=80&w=1080",
  },
  {
    icon: Dumbbell,
    title: "Fitness Corner",
    description: "Basic gym equipment including weights and cardio machines for staying active",
    image: "https://images.unsplash.com/photo-1589955898954-9c8d4bb86823?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxneW0lMjBlcXVpcG1lbnQlMjB3ZWlnaHRzJTIwZml0bmVzc3xlbnwxfHx8fDE3NzA0NjU5ODB8MA&ixlib=rb-4.1.0&q=80&w=1080",
  },
];

const INITIAL_SHOW = 4;

function FacilityCard({ facility }) {
  const Icon = facility.icon;
  return (
    <div
      className="group rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        backgroundColor: "var(--lp-bg-card)",
        border: "1px solid var(--lp-border)",
        boxShadow: "var(--lp-card-shadow)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "var(--lp-card-shadow-hover)";
        e.currentTarget.style.transform = "translateY(-4px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "var(--lp-card-shadow)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Image */}
      <SpotlightImage spotlightColor="rgba(255, 140, 66, 0.5)" className="h-48">
        <div className="relative h-full overflow-hidden">
          <ImageWithFallback
            src={facility.image}
            alt={facility.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          {/* Icon Badge */}
          <div
            className="absolute top-4 right-4 w-10 h-10 rounded-xl flex items-center justify-center backdrop-blur-md"
            style={{ backgroundColor: "rgba(255, 140, 66, 0.85)" }}
          >
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </SpotlightImage>

      {/* Content */}
      <div className="p-5">
        <h3 className="text-base font-medium mb-1.5" style={{ color: "var(--lp-text)" }}>
          {facility.title}
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: "var(--lp-text-secondary)" }}>
          {facility.description}
        </p>
      </div>
    </div>
  );
}

export function FacilitiesSection() {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? facilities : facilities.slice(0, INITIAL_SHOW);

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
            Beyond your room, enjoy access to well-maintained common areas
            designed for comfort, productivity, and relaxation.
          </p>
        </div>

        {/* Facilities Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {visible.map((facility, index) => (
            <FacilityCard key={index} facility={facility} />
          ))}
        </div>

        {/* Show All Toggle */}
        {facilities.length > INITIAL_SHOW && (
          <div className="text-center">
            <button
              onClick={() => setShowAll(!showAll)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium transition-all duration-300"
              style={{
                backgroundColor: "var(--lp-icon-bg)",
                border: "1px solid var(--lp-border)",
                color: "var(--lp-text)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--lp-accent)";
                e.currentTarget.style.color = "var(--lp-accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--lp-border)";
                e.currentTarget.style.color = "var(--lp-text)";
              }}
            >
              {showAll ? (
                <>Show Less <ChevronUp className="w-4 h-4" /></>
              ) : (
                <>Show All {facilities.length} Facilities <ChevronDown className="w-4 h-4" /></>
              )}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default FacilitiesSection;
