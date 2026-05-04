import { ShieldCheck, Sparkles, DollarSign, Leaf, MapPin, Sofa } from 'lucide-react';

const benefits = [
  {
    icon: ShieldCheck,
    title: 'Safe and Secure Living',
    description: '24/7 security with RFID access ensures your safety at all times.',
  },
  {
    icon: Sparkles,
    title: 'Clean and Well-Maintained Spaces',
    description: 'We prioritize cleanliness and regular maintenance for a comfortable stay.',
  },
  {
    icon: DollarSign,
    title: 'Affordable and Transparent Pricing',
    description: 'No hidden fees with clear billing and fair utility sharing.',
  },
  {
    icon: Leaf,
    title: 'Peaceful and Organized Environment',
    description: 'Strict policies help maintain a quiet and respectful community.',
  },
  {
    icon: MapPin,
    title: 'Convenient Location and Services',
    description: 'Easy access to essentials with organized delivery and parcel systems.',
  },
  {
    icon: Sofa,
    title: 'Flexible and Comfortable Accommodation',
    description: 'Choose from shared or private rooms that fit your lifestyle.',
  },
];

export function BenefitsSection() {
  return (
    <section className="py-16 lg:py-20" style={{ backgroundColor: 'var(--lp-bg)' }}>
      <div className="max-w-screen-2xl mx-auto px-8 lg:px-12">
        {/* Header */}
        <div className="text-center mb-12">
          <p
            className="text-xs mb-3 tracking-widest uppercase font-medium"
            style={{ color: 'var(--lp-accent)' }}
          >
            Why Choose Us
          </p>
          <h2
            className="text-3xl lg:text-4xl font-medium mb-5 tracking-tight"
            style={{ color: 'var(--lp-text)' }}
          >
            Your Perfect Living Solution
          </h2>
          <p
            className="max-w-2xl mx-auto font-light leading-relaxed text-sm"
            style={{ color: 'var(--lp-text-secondary)' }}
          >
            Discover why thousands of residents choose Lilycrest for their
            dormitory living experience.
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <div
                key={index}
                className="group p-8 rounded-2xl transition-all duration-300"
                style={{
                  backgroundColor: 'var(--lp-bg-card)',
                  border: '1px solid var(--lp-border)',
                  boxShadow: 'var(--lp-card-shadow)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = 'var(--lp-card-shadow-hover)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'var(--lp-card-shadow)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110"
                  style={{ backgroundColor: 'var(--lp-icon-bg)' }}
                >
                  <Icon className="w-5 h-5" style={{ color: 'var(--lp-accent)' }} />
                </div>
                <h3
                  className="text-lg font-medium mb-2 tracking-tight"
                  style={{ color: 'var(--lp-text)' }}
                >
                  {benefit.title}
                </h3>
                <p
                  className="text-sm leading-relaxed font-light"
                  style={{ color: 'var(--lp-text-secondary)' }}
                >
                  {benefit.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default BenefitsSection;
