import {
  Wifi,
  Coffee,
  Utensils,
  Shirt,
  BookOpen,
  Users,
  Sofa,
  Dumbbell,
} from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import SpotlightImage from "../../tenant/components/SpotlightImage";

const facilities = [
  {
    icon: Wifi,
    title: "High-Speed Wi-Fi",
    description:
      "100 Mbps fiber internet throughout the building for seamless browsing and streaming",
    color: "#E7710F",
    image:
      "https://images.unsplash.com/photo-1588501360908-30d639a70964?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjB3aWZpJTIwaW50ZXJuZXQlMjBsb3VuZ2V8ZW58MXx8fHwxNzcwNDY1OTc0fDA&ixlib=rb-4.1.0&q=80&w=1080",
  },
  {
    icon: BookOpen,
    title: "Study Lounge",
    description:
      "Quiet, well-lit dedicated spaces perfect for focused studying and academic work",
    color: "#0C375F",
    image:
      "https://images.unsplash.com/photo-1516042438821-0abd7a73c4b3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsaWJyYXJ5JTIwc3R1ZHklMjBsb3VuZ2UlMjBxdWlldHxlbnwxfHx8fDE3NzA0NjU5NzR8MA&ixlib=rb-4.1.0&q=80&w=1080",
  },
  {
    icon: Utensils,
    title: "Shared Kitchen",
    description:
      "Fully-equipped with stove, refrigerator, and cookware for preparing your meals",
    color: "#EDB938",
    image:
      "https://images.unsplash.com/photo-1657084031100-6925483d8a7a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzaGFyZWQlMjBraXRjaGVuJTIwZG9ybWl0b3J5JTIwY29tbXVuYWx8ZW58MXx8fHwxNzcwNDY1OTc1fDA&ixlib=rb-4.1.0&q=80&w=1080",
  },
  {
    icon: Shirt,
    title: "Laundry Area",
    description:
      "Coin-operated washers and dryers available 24/7 for your convenience",
    color: "#E7710F",
    image:
      "https://images.unsplash.com/photo-1758279745240-b75977c88fa8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsYXVuZHJ5JTIwcm9vbSUyMHdhc2hlcnMlMjBkcnllcnN8ZW58MXx8fHwxNzcwNDY1OTc1fDA&ixlib=rb-4.1.0&q=80&w=1080",
  },
  {
    icon: Sofa,
    title: "Common Lounge",
    description:
      "Comfortable shared space to relax, socialize, and build community with residents",
    color: "#0C375F",
    image:
      "https://images.unsplash.com/photo-1759038085939-2d32655d95ac?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb21tb24lMjBsb3VuZ2UlMjBzZWF0aW5nJTIwYXJlYXxlbnwxfHx8fDE3NzA0NjU5NzV8MA&ixlib=rb-4.1.0&q=80&w=1080",
  },
  {
    icon: Coffee,
    title: "Pantry Area",
    description:
      "Water dispenser, microwave, and dining tables for quick meals and refreshments",
    color: "#EDB938",
    image:
      "https://images.unsplash.com/photo-1758977403341-0104135995af?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkaW5pbmclMjBhcmVhJTIwdGFibGUlMjBjaGFpcnN8ZW58MXx8fHwxNzcwNDY1OTc5fDA&ixlib=rb-4.1.0&q=80&w=1080",
  },
  {
    icon: Users,
    title: "Reception Desk",
    description:
      "Friendly staff available daily for assistance, inquiries, and 24/7 security",
    color: "#E7710F",
    image:
      "https://images.unsplash.com/photo-1648960456182-00643d5d20eb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyZWNlcHRpb24lMjBkZXNrJTIwbG9iYnklMjBob3RlbHxlbnwxfHx8fDE3NzA0NjU5NzZ8MA&ixlib=rb-4.1.0&q=80&w=1080",
  },
  {
    icon: Dumbbell,
    title: "Fitness Corner",
    description:
      "Basic gym equipment including weights and cardio machines for staying active",
    color: "#0C375F",
    image:
      "https://images.unsplash.com/photo-1589955898954-9c8d4bb86823?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxneW0lMjBlcXVpcG1lbnQlMjB3ZWlnaHRzJTIwZml0bmVzc3xlbnwxfHx8fDE3NzA0NjU5ODB8MA&ixlib=rb-4.1.0&q=80&w=1080",
  },
];

export function FacilitiesSection() {
  return (
    <section
      className="py-24 lg:py-32"
      style={{ backgroundColor: "#0C375F" }}
      id="facilities"
    >
      <div className="max-w-7xl mx-auto px-8 lg:px-12">
        {/* Header */}
        <div className="text-center mb-20">
          <p className="text-xs text-white/40 mb-3 tracking-widest uppercase font-light">
            Shared Spaces
          </p>
          <h2 className="text-4xl lg:text-5xl font-light mb-5 tracking-tight text-white">
            Facilities & Amenities
          </h2>
          <p className="text-white/60 max-w-2xl mx-auto font-light leading-relaxed">
            Beyond your room, enjoy access to well-maintained common areas
            designed for studying, cooking, and relaxation.
          </p>
        </div>

        {/* Facilities Grid with Images */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {facilities.map((facility, index) => {
            const Icon = facility.icon;
            return (
              <div
                key={index}
                className="group rounded-2xl overflow-hidden bg-white/5 backdrop-blur-sm border border-white/10 hover:border-white/20 transition-all duration-300"
              >
                {/* Image */}
                <SpotlightImage
                  spotlightColor={
                    index % 2 === 0
                      ? "rgba(231, 113, 15, 0.6)"
                      : "rgba(237, 185, 56, 0.6)"
                  }
                  className="h-48"
                >
                  <div className="relative h-full overflow-hidden">
                    <ImageWithFallback
                      src={facility.image}
                      alt={facility.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                    {/* Icon Badge */}
                    <div
                      className="absolute top-4 right-4 w-12 h-12 rounded-xl flex items-center justify-center backdrop-blur-md"
                      style={{ backgroundColor: `${facility.color}90` }}
                    >
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </SpotlightImage>

                {/* Content */}
                <div className="p-6">
                  <h3 className="text-lg font-medium mb-2 text-white">
                    {facility.title}
                  </h3>
                  <p className="text-sm text-white/60 leading-relaxed font-light">
                    {facility.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
