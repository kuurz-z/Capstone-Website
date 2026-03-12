import { ArrowRight, Phone, Mail } from 'lucide-react';

export function CTASection() {
  return (
    <section className="py-16 lg:py-20 bg-gradient-to-br from-gray-900 to-gray-800 relative overflow-hidden">
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
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm mb-6">
            <span className="text-white/80 text-xs font-medium tracking-wider uppercase">Limited Availability</span>
          </div>

          {/* Heading */}
          <h2 className="text-4xl lg:text-6xl font-normal text-white mb-5 tracking-tight leading-tight">
            Your perfect student home awaits
          </h2>

          {/* Description */}
          <p className="text-white/70 text-lg mb-10 max-w-2xl mx-auto leading-relaxed">
            Join hundreds of students who've made Lilycrest their home. Book a viewing today and experience the difference.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
            <button
              className="inline-flex items-center justify-center gap-2 text-white px-10 py-5 rounded-full font-normal hover:opacity-90 transition-all duration-300 hover:shadow-xl text-base"
              style={{ backgroundColor: '#E7710F' }}
            >
              Book a Viewing
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              className="px-10 py-5 bg-transparent border border-white/30 text-white hover:bg-white/10 rounded-full font-normal text-base transition-all duration-300"
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
              <span className="text-sm font-normal">+63 912 345 6789</span>
            </a>
            <div className="hidden sm:block w-px h-8 bg-white/10"></div>
            <a href="mailto:hello@lilycrest.com" className="flex items-center gap-3 text-white/60 hover:text-white transition-colors">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <Mail className="w-4 h-4" />
              </div>
              <span className="text-sm font-normal">hello@lilycrest.com</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export default CTASection;


