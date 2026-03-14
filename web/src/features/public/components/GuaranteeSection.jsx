import { CheckCircle, RefreshCw, Shield, Clock } from 'lucide-react';

const guarantees = [
  {
    icon: CheckCircle,
    title: '7-Day Satisfaction Guarantee',
    description: 'Not happy with your room? Get a full refund within the first 7 days, no questions asked.',
    color: '#D4982B'
  },
  {
    icon: RefreshCw,
    title: 'Flexible Cancellation',
    description: 'Life happens. Cancel your contract with 30 days notice and receive a prorated refund.',
    color: '#183153'
  },
  {
    icon: Shield,
    title: 'Security Deposit Protected',
    description: 'Your deposit is fully refundable upon move-out, provided the room is in good condition.',
    color: '#EDB938'
  },
  {
    icon: Clock,
    title: '24-Hour Support',
    description: 'Maintenance issues? Emergency? Our support team is available round the clock.',
    color: '#D4982B'
  }
];

export function GuaranteeSection() {
  return (
    <section className="py-16 lg:py-20 bg-white">
      <div className="max-w-7xl mx-auto px-8 lg:px-12">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-xs text-gray-500 mb-3 tracking-widest uppercase font-medium">Our Promise</p>
          <h2 className="text-4xl lg:text-5xl font-normal mb-5 tracking-tight" style={{ color: '#183153' }}>
            Risk-Free Living Guarantee
          </h2>
          <p className="text-gray-500 max-w-2xl mx-auto font-normal leading-relaxed">
            We stand behind the quality of our accommodations. Your satisfaction and peace of mind are guaranteed.
          </p>
        </div>

        {/* Guarantees Grid */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {guarantees.map((guarantee, index) => {
            const Icon = guarantee.icon;
            return (
              <div
                key={index}
                className="p-8 rounded-3xl bg-gradient-to-br from-gray-50 to-white border border-gray-100 hover:border-gray-200 hover:shadow-xl transition-all duration-300"
              >
                <div className="flex gap-6">
                  <div
                    className="w-12 h-12 flex-shrink-0 rounded-2xl flex items-center justify-center"
                    style={{ backgroundColor: `${guarantee.color}15` }}
                  >
                    <Icon className="w-6 h-6" style={{ color: guarantee.color }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium mb-2 tracking-tight" style={{ color: '#183153' }}>
                      {guarantee.title}
                    </h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {guarantee.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Trust Badges */}
        <div className="mt-12 flex flex-wrap justify-center items-center gap-8 pt-10 border-t border-gray-100">
          <div className="text-center">
            <p className="text-xs text-gray-500 font-normal mb-1">Accredited by</p>
            <p className="text-sm font-semibold" style={{ color: '#183153' }}>DTI Registered</p>
          </div>
          <div className="w-px h-8 bg-gray-200"></div>
          <div className="text-center">
            <p className="text-xs text-gray-500 font-normal mb-1">Certified</p>
            <p className="text-sm font-semibold" style={{ color: '#183153' }}>Fire Safety Compliant</p>
          </div>
          <div className="w-px h-8 bg-gray-200"></div>
          <div className="text-center">
            <p className="text-xs text-gray-500 font-normal mb-1">Trusted by</p>
            <p className="text-sm font-semibold" style={{ color: '#183153' }}>500+ Students</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default GuaranteeSection;
