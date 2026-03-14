import { Wifi, Shield, Zap, Users, Clock, Home } from 'lucide-react';

const benefits = [
  {
    icon: Wifi,
    title: 'High-Speed Internet',
    description: 'Unlimited fiber internet connection perfect for studying and streaming.',
    color: '#D4982B'
  },
  {
    icon: Shield,
    title: '24/7 Security',
    description: 'Round-the-clock security with CCTV monitoring for your peace of mind.',
    color: '#183153'
  },
  {
    icon: Zap,
    title: 'All Utilities Included',
    description: 'Electricity, water, and maintenance fees included in your monthly rent.',
    color: '#EDB938'
  },
  {
    icon: Users,
    title: 'Community Spaces',
    description: 'Shared lounge and study areas to connect with fellow students.',
    color: '#D4982B'
  },
  {
    icon: Clock,
    title: 'Flexible Terms',
    description: 'Monthly or semester-based contracts with no hidden fees.',
    color: '#183153'
  },
  {
    icon: Home,
    title: 'Fully Furnished',
    description: 'Move-in ready rooms with bed, desk, closet, and air conditioning.',
    color: '#EDB938'
  }
];

export function BenefitsSection() {
  return (
    <section className="py-16 lg:py-20 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-8 lg:px-12">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-xs text-gray-500 mb-3 tracking-widest uppercase font-medium">Why Choose Us</p>
          <h2 className="text-4xl lg:text-5xl font-normal mb-5 tracking-tight" style={{ color: '#183153' }}>
            Everything You Need to Succeed
          </h2>
          <p className="text-gray-500 max-w-2xl mx-auto font-normal leading-relaxed">
            More than just a place to sleep. Lilycrest provides a complete living experience designed for student success.
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <div
                key={index}
                className="group p-8 rounded-3xl bg-white border border-gray-100 hover:border-gray-200 hover:shadow-xl transition-all duration-300"
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300"
                  style={{ backgroundColor: `${benefit.color}15` }}
                >
                  <Icon className="w-6 h-6" style={{ color: benefit.color }} />
                </div>
                <h3 className="text-xl font-medium mb-3 tracking-tight" style={{ color: '#183153' }}>
                  {benefit.title}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">
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
