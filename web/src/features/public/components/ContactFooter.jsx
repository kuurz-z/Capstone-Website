import { Mail, Phone, MapPin, Instagram, Facebook, Twitter } from 'lucide-react';

export function ContactFooter() {
  return (
    <footer className="py-20 lg:py-24" style={{ backgroundColor: '#183153' }}>
      <div className="max-w-7xl mx-auto px-8 lg:px-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-16 mb-16">
          {/* Brand */}
          <div>
            <h3 className="text-2xl font-light text-white mb-4 tracking-tight">Lilycrest</h3>
            <p className="text-white/50 text-sm font-light leading-relaxed">
              Premium student living spaces designed for comfort, convenience, and community.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-white/70 text-xs tracking-widest uppercase mb-6 font-light">Navigation</h4>
            <ul className="space-y-3">
              <li>
                <a href="#rooms" className="text-white/60 hover:text-white text-sm font-light transition-colors">
                  Browse Rooms
                </a>
              </li>
              <li>
                <a href="#branches" className="text-white/60 hover:text-white text-sm font-light transition-colors">
                  Our Branches
                </a>
              </li>
              <li>
                <a href="#amenities" className="text-white/60 hover:text-white text-sm font-light transition-colors">
                  Amenities
                </a>
              </li>
              <li>
                <a href="#about" className="text-white/60 hover:text-white text-sm font-light transition-colors">
                  About Us
                </a>
              </li>
            </ul>
          </div>

          {/* Branches */}
          <div>
            <h4 className="text-white/70 text-xs tracking-widest uppercase mb-6 font-light">Locations</h4>
            <ul className="space-y-4">
              <li>
                <p className="text-white text-sm mb-1 font-light">Gil Puyat</p>
                <p className="text-white/50 text-xs font-light">Manila, Philippines</p>
              </li>
              <li>
                <p className="text-white text-sm mb-1 font-light">Guadalupe</p>
                <p className="text-white/50 text-xs font-light">Manila, Philippines</p>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-white/70 text-xs tracking-widest uppercase mb-6 font-light">Get in Touch</h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-white/40 mt-0.5" />
                <a href="mailto:hello@lilycrest.com" className="text-white/60 hover:text-white text-sm font-light transition-colors">
                  hello@lilycrest.com
                </a>
              </li>
              <li className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-white/40 mt-0.5" />
                <a href="tel:+639123456789" className="text-white/60 hover:text-white text-sm font-light transition-colors">
                  +63 912 345 6789
                </a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-white/40 mt-0.5" />
                <span className="text-white/60 text-sm font-light">
                  Manila, Philippines
                </span>
              </li>
            </ul>

            {/* Social */}
            <div className="flex gap-3 mt-6">
              <a
                href="#"
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <Facebook className="w-4 h-4 text-white/60" />
              </a>
              <a
                href="#"
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <Instagram className="w-4 h-4 text-white/60" />
              </a>
              <a
                href="#"
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <Twitter className="w-4 h-4 text-white/60" />
              </a>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="pt-8 border-t border-white/10">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-white/40 text-xs font-light">
              © 2026 Lilycrest. All rights reserved.
            </p>
            <div className="flex gap-6">
              <a href="#" className="text-white/40 hover:text-white/60 text-xs font-light transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="text-white/40 hover:text-white/60 text-xs font-light transition-colors">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default ContactFooter;