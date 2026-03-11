import { Heart, Users, Award } from 'lucide-react';

export function StorytellingSection() {
  return (
    <section className="py-24 lg:py-32 bg-gradient-to-br from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-8 lg:px-12">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left - Story */}
          <div>
            <p className="text-xs text-gray-400 mb-3 tracking-widest uppercase font-light">Our Story</p>
            <h2 className="text-4xl lg:text-5xl font-light mb-8 tracking-tight leading-tight" style={{ color: '#0C375F' }}>
              About Lilycrest
            </h2>
            
            <div className="space-y-6 mb-10">
              <p className="text-gray-600 leading-relaxed font-light">
                Lilycrest was founded in 2019 by former university students who understood the struggle of finding quality, affordable accommodation near campus. We experienced firsthand the challenges of overpriced, poorly maintained dormitories with unreliable utilities.
              </p>
              <p className="text-gray-600 leading-relaxed font-light">
                Today, we've created the living spaces we wished existed during our college years. Every detail—from the high-speed internet to the 24/7 security—is designed with student needs in mind.
              </p>
              <p className="text-gray-600 leading-relaxed font-light">
                Our mission is simple: provide students with a safe, comfortable, and inspiring home where they can focus on what truly matters—their education and personal growth.
              </p>
            </div>

            <button
              className="text-white px-8 py-6 rounded-full font-light hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#E7710F' }}
            >
              Learn More About Us
            </button>
          </div>

          {/* Right - Values */}
          <div className="space-y-6">
            <div className="p-8 rounded-3xl bg-white border border-gray-100 hover:shadow-xl transition-all duration-300">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6"
                style={{ backgroundColor: '#E7710F15' }}
              >
                <Heart className="w-6 h-6" style={{ color: '#E7710F' }} />
              </div>
              <h3 className="text-xl font-normal mb-3 tracking-tight" style={{ color: '#0C375F' }}>
                Student-First Approach
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed font-light">
                Every decision we make prioritizes the comfort, safety, and success of our residents. Your wellbeing is our top priority.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-white border border-gray-100 hover:shadow-xl transition-all duration-300">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6"
                style={{ backgroundColor: '#0C375F15' }}
              >
                <Users className="w-6 h-6" style={{ color: '#0C375F' }} />
              </div>
              <h3 className="text-xl font-normal mb-3 tracking-tight" style={{ color: '#0C375F' }}>
                Community Matters
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed font-light">
                We foster a supportive environment where students can build lasting friendships and professional networks.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-white border border-gray-100 hover:shadow-xl transition-all duration-300">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6"
                style={{ backgroundColor: '#EDB93815' }}
              >
                <Award className="w-6 h-6" style={{ color: '#EDB938' }} />
              </div>
              <h3 className="text-xl font-normal mb-3 tracking-tight" style={{ color: '#0C375F' }}>
                Quality & Transparency
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed font-light">
                No hidden fees, no surprises. We maintain high standards and communicate openly with all our residents.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default StorytellingSection;
