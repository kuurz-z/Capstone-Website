import { Heart, Users, Award } from 'lucide-react';

export function StorytellingSection() {
  return (
    <section className="py-16 lg:py-20" style={{ backgroundColor: 'var(--lp-bg)' }}>
      <div className="max-w-screen-2xl mx-auto px-8 lg:px-12">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left - Story */}
          <div>
            <p className="text-xs mb-3 tracking-widest uppercase font-medium" style={{ color: 'var(--lp-accent)' }}>Our Story</p>
            <h2 className="text-3xl lg:text-4xl font-medium mb-8 tracking-tight leading-tight" style={{ color: 'var(--lp-text)' }}>
              About Lilycrest
            </h2>
            
            <div className="space-y-5 mb-8">
              <p className="leading-relaxed" style={{ color: 'var(--lp-text-secondary)' }}>
                Lilycrest was founded by people who understood the struggle of finding quality, affordable accommodation close to the places that matter. We experienced firsthand the challenges of overpriced, poorly maintained housing with unreliable utilities.
              </p>
              <p className="leading-relaxed" style={{ color: 'var(--lp-text-secondary)' }}>
                Today, we've created the living spaces we wished existed. Every detail — from the high-speed internet to the 24/7 security — is designed with your comfort and peace of mind in focus.
              </p>
              <p className="leading-relaxed" style={{ color: 'var(--lp-text-secondary)' }}>
                Our mission is simple: provide residents with a safe, comfortable, and inspiring home where they can focus on what truly matters — their personal and professional growth.
              </p>
            </div>

            <a
              href="#inquiry"
              className="inline-block text-white px-8 py-4 rounded-full font-medium transition-all duration-300"
              style={{
                backgroundColor: 'var(--lp-accent)',
                boxShadow: '0 4px 16px rgba(255, 140, 66, 0.25)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(255, 140, 66, 0.35)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(255, 140, 66, 0.25)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Get In Touch
            </a>
          </div>

          {/* Right - Values */}
          <div className="space-y-5">
            {[
              { icon: Heart, title: 'Resident-First Approach', desc: 'Every decision we make prioritizes the comfort, safety, and well-being of our residents. Your peace of mind is our top priority.' },
              { icon: Users, title: 'Community Matters', desc: 'We foster a supportive environment where residents can build lasting friendships and meaningful connections.' },
              { icon: Award, title: 'Quality & Transparency', desc: 'No hidden fees, no surprises. We maintain high standards and communicate openly with all our residents.' },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={i}
                  className="p-7 rounded-2xl transition-all duration-300"
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
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                    style={{ backgroundColor: 'var(--lp-icon-bg)' }}
                  >
                    <Icon className="w-5 h-5" style={{ color: 'var(--lp-accent)' }} />
                  </div>
                  <h3 className="text-lg font-medium mb-2 tracking-tight" style={{ color: 'var(--lp-text)' }}>
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--lp-text-secondary)' }}>
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export default StorytellingSection;
