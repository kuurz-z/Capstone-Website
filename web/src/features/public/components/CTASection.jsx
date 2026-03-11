import { ArrowRight, Phone, Mail } from 'lucide-react';

export function CTASection() {
  return (
    <section className="py-24 lg:py-32 bg-gradient-to-br from-gray-900 to-gray-800 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }}></div>
      </div>

      <div className="max-w-5xl mx-auto px-8 lg:px-12 relative z-10">
        <div className="text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm mb-8">
            <span className="text-white/70 text-xs font-light tracking-wider uppercase">Limited Availability</span>
          </div>

          {/* Heading */}
          <h2 className="text-4xl lg:text-6xl font-light text-white mb-6 tracking-tight leading-tight">
            Your perfect student home awaits
          </h2>

          {/* Description */}
          <p className="text-white/60 text-lg mb-12 max-w-2xl mx-auto leading-relaxed font-light">
            Join hundreds of students who've made Lilycrest their home. Book a viewing today and experience the difference.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <button
              className="text-white px-10 py-7 rounded-full font-light hover:opacity-90 transition-opacity text-base"
              style={{ backgroundColor: '#E7710F' }}
            >
              Book a Viewing
              <ArrowRight className="w-5 h-5 ml-2" />
            </button>
            <button
              className="px-10 py-7 bg-transparent border border-white/30 text-white hover:bg-white/5 rounded-full font-light text-base"
            >
              Download Brochure
            </button>
          </div>

          {/* Contact Info */}
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center pt-8 border-t border-white/10">
            <a href="tel:+639123456789" className="flex items-center gap-3 text-white/60 hover:text-white transition-colors">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <Phone className="w-4 h-4" />
              </div>
              <span className="text-sm font-light">+63 912 345 6789</span>
            </a>
            <div className="hidden sm:block w-px h-8 bg-white/10"></div>
            <a href="mailto:hello@lilycrest.com" className="flex items-center gap-3 text-white/60 hover:text-white transition-colors">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <Mail className="w-4 h-4" />
              </div>
              <span className="text-sm font-light">hello@lilycrest.com</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export default CTASection;


