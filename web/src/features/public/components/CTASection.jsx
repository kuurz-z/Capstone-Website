import { ArrowRight, CheckCircle, RefreshCw, Shield, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

const guarantees = [
  { icon: CheckCircle, text: '7-Day Satisfaction Guarantee' },
  { icon: RefreshCw, text: 'Flexible Cancellation' },
  { icon: Shield, text: 'Deposit Protected' },
  { icon: Clock, text: '24-Hour Support' },
];

export function CTASection() {
  return (
    <section
      className="relative py-14 lg:py-16 overflow-hidden"
      style={{ backgroundColor: 'var(--lp-bg)' }}
    >
      <div className="max-w-screen-2xl mx-auto px-8 lg:px-12 relative z-10">
        <div className="text-center max-w-3xl mx-auto">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
            style={{
              backgroundColor: 'var(--lp-icon-bg)',
              border: '1px solid var(--lp-border)',
            }}
          >
            <span
              className="text-xs font-medium tracking-wider uppercase"
              style={{ color: 'var(--lp-accent)' }}
            >
              Start Your Journey
            </span>
          </div>

          {/* Headline */}
          <h2
            className="text-3xl lg:text-4xl font-medium mb-5 tracking-tight"
            style={{ color: 'var(--lp-text)' }}
          >
            Ready to Find Your{' '}
            <span style={{ color: 'var(--lp-accent)' }}>New Home</span>?
          </h2>
          <p
            className="text-base font-light leading-relaxed mb-10 max-w-2xl mx-auto"
            style={{ color: 'var(--lp-text-secondary)' }}
          >
            Browse available rooms, schedule a viewing, and move in with
            confidence. Move in as soon as <strong style={{ color: 'var(--lp-text)', fontWeight: '500' }}>7 days</strong>. No hidden fees. Flexible terms.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Link
              to="/applicant/check-availability"
              className="inline-flex items-center justify-center gap-2 text-white px-8 py-4 rounded-full font-medium transition-all duration-300 text-sm"
              style={{
                backgroundColor: 'var(--lp-accent)',
                boxShadow: '0 4px 20px rgba(212, 175, 55, 0.25)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 8px 30px rgba(212, 175, 55, 0.4)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(212, 175, 55, 0.25)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Browse Available Rooms
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#inquiry"
              className="px-8 py-4 rounded-full font-medium text-sm transition-all duration-300"
              style={{
                color: 'var(--lp-text)',
                border: '1px solid var(--lp-border)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--lp-icon-bg)';
                e.currentTarget.style.borderColor = 'var(--lp-accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = 'var(--lp-border)';
              }}
            >
              Contact Us
            </a>
          </div>

          {/* Guarantee Badges */}
          <div
            className="flex flex-wrap justify-center gap-6 pt-10"
            style={{ borderTop: '1px solid var(--lp-border)' }}
          >
            {guarantees.map((g, i) => {
              const Icon = g.icon;
              return (
                <div key={i} className="flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color: 'var(--lp-accent)' }} />
                  <span className="text-xs font-light" style={{ color: 'var(--lp-text-muted)' }}>
                    {g.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export default CTASection;
