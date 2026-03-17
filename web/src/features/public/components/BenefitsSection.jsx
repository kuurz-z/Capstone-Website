import { Wifi, Shield, Zap, Users, Clock, Home } from 'lucide-react';

const benefits = [
  {
    icon: Wifi,
    title: 'High-Speed Internet',
    description: 'Unlimited fiber internet connection perfect for work and streaming.',
  },
  {
    icon: Shield,
    title: '24/7 Security',
    description: 'Round-the-clock security with CCTV monitoring for your peace of mind.',
  },
  {
    icon: Zap,
    title: 'All Utilities Included',
    description: 'Electricity, water, and maintenance fees included in your monthly rent.',
  },
  {
    icon: Users,
    title: 'Community Spaces',
    description: 'Shared lounge and common areas to connect with fellow residents.',
  },
  {
    icon: Clock,
    title: 'Flexible Terms',
    description: 'Monthly or long-term contracts with no hidden fees.',
  },
  {
    icon: Home,
    title: 'Fully Furnished',
    description: 'Move-in ready rooms with bed, desk, closet, and air conditioning.',
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
            Everything You Need
          </h2>
          <p
            className="max-w-2xl mx-auto font-light leading-relaxed text-sm"
            style={{ color: 'var(--lp-text-secondary)' }}
          >
            More than just a place to sleep. Lilycrest provides a complete
            living experience designed for your comfort.
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
