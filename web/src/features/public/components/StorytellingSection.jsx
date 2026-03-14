import { Heart, Users, Award } from 'lucide-react';

export function StorytellingSection() {
  return (
    <section className="py-16 lg:py-20 bg-gradient-to-br from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-8 lg:px-12">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left - Story */}
          <div>
            <p className="text-xs text-gray-500 mb-3 tracking-widest uppercase font-medium">Our Story</p>
            <h2 className="text-4xl lg:text-5xl font-normal mb-8 tracking-tight leading-tight" style={{ color: '#183153' }}>
              About Lilycrest
            </h2>
            
            <div className="space-y-5 mb-8">
              <p className="text-gray-600 leading-relaxed">
                Lilycrest was founded in 2019 by former university students who understood the struggle of finding quality, affordable accommodation near campus. We experienced firsthand the challenges of overpriced, poorly maintained dormitories with unreliable utilities.
              </p>
              <p className="text-gray-600 leading-relaxed">
                Today, we've created the living spaces we wished existed during our college years. Every detail—from the high-speed internet to the 24/7 security—is designed with student needs in mind.
              </p>
              <p className="text-gray-600 leading-relaxed">
                Our mission is simple: provide students with a safe, comfortable, and inspiring home where they can focus on what truly matters—their education and personal growth.
              </p>
            </div>

            <button
              className="text-white px-8 py-5 rounded-full font-normal hover:opacity-90 transition-all duration-300 hover:shadow-lg"
              style={{ backgroundColor: '#D4982B' }}
            >
              Learn More About Us
            </button>
          </div>

          {/* Right - Values */}
          <div className="space-y-6">
            <div className="p-8 rounded-3xl bg-white border border-gray-100 hover:shadow-xl transition-all duration-300">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6"
                style={{ backgroundColor: '#D4982B15' }}
              >
                <Heart className="w-6 h-6" style={{ color: '#D4982B' }} />
              </div>
              <h3 className="text-xl font-medium mb-3 tracking-tight" style={{ color: '#183153' }}>
                Student-First Approach
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Every decision we make prioritizes the comfort, safety, and success of our residents. Your wellbeing is our top priority.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-white border border-gray-100 hover:shadow-xl transition-all duration-300">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6"
                style={{ backgroundColor: '#18315315' }}
              >
                <Users className="w-6 h-6" style={{ color: '#183153' }} />
              </div>
              <h3 className="text-xl font-medium mb-3 tracking-tight" style={{ color: '#183153' }}>
                Community Matters
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
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
              <h3 className="text-xl font-medium mb-3 tracking-tight" style={{ color: '#183153' }}>
                Quality & Transparency
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
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
