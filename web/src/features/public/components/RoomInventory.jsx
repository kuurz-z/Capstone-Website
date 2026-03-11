import { ArrowRight } from 'lucide-react';

const roomListings = [
  {
    id: 1,
    title: 'Private Room',
    subtitle: 'Gil Puyat Branch',
    description: 'Perfect for students who value privacy and personal space. Ideal for focused studying.',
    price: '₱8,500',
    image: 'https://images.unsplash.com/photo-1610307522657-8c0304960189?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaW5pbWFsaXN0JTIwYmVkcm9vbSUyMGRlc2lnbnxlbnwxfHx8fDE3NzAzMDM5ODB8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    inclusions: ['Single Bed', 'Study Desk & Chair', 'Closet', 'Aircon', 'Wi-Fi', 'Utilities']
  },
  {
    id: 2,
    title: 'Double Occupancy',
    subtitle: 'Gil Puyat Branch',
    description: 'Share with a roommate while enjoying your own space. Great for making friends.',
    price: '₱5,000',
    image: 'https://images.unsplash.com/photo-1764760764956-fcb78be107a5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBiZWRyb29tJTIwaW50ZXJpb3IlMjBuYXR1cmFsJTIwbGlnaHR8ZW58MXx8fHwxNzcwMjkwMzY5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    inclusions: ['2 Single Beds', '2 Study Desks', 'Shared Closet', 'Aircon', 'Wi-Fi', 'Utilities']
  },
  {
    id: 3,
    title: 'Quadruple Room',
    subtitle: 'Gil Puyat & Guadalupe',
    description: 'Budget-friendly option with a vibrant community atmosphere. All essentials included.',
    price: '₱3,500',
    image: 'https://images.unsplash.com/photo-1758521540263-e15a58e64248?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb3p5JTIwc2hhcmVkJTIwYmVkcm9vbXxlbnwxfHx8fDE3NzAzNTI3MTB8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    inclusions: ['4 Beds', '4 Study Desks', 'Shared Storage', 'Aircon', 'Wi-Fi', 'Utilities']
  }
];

export function RoomInventory() {
  
  return (
    <section className="py-24 lg:py-32 bg-white" id="rooms">
      <div className="max-w-7xl mx-auto px-8 lg:px-12">
        {/* Header */}
        <div className="text-center mb-6">
          <p className="text-xs text-gray-400 mb-3 tracking-widest uppercase font-light">Room Options</p>
          <h2 className="text-4xl lg:text-5xl font-light mb-5 tracking-tight" style={{ color: '#0C375F' }}>
            Choose Your Room Type
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto mb-16 font-light leading-relaxed">
            All rooms come fully furnished with essential amenities. Pick the option that fits your budget and lifestyle.
          </p>
        </div>

        {/* Room Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {roomListings.map((room) => (
            <div
              key={room.id}
              className="bg-white rounded-3xl overflow-hidden border border-gray-100 hover:border-gray-200 hover:shadow-2xl transition-all duration-300"
            >
              {/* Image */}
              <div className="relative h-72 overflow-hidden group">
                <img
                  src={room.image}
                  alt={room.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                {/* Arrow Button */}
                <button
                  className="absolute bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl hover:shadow-2xl hover:scale-110 transition-all duration-300"
                  style={{ backgroundColor: '#0C375F' }}
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-8">     
                <h3 className="font-normal text-2xl mb-2 tracking-tight" style={{ color: '#0C375F' }}>
                  {room.title}
                </h3>
                <p className="text-sm text-gray-400 mb-4 font-light">{room.subtitle}</p>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed font-light">
                  {room.description}
                </p>

                {/* Inclusions */}
                <div className="mb-8">
                  <p className="text-xs text-gray-400 mb-3 font-light">Included:</p>
                  <div className="flex flex-wrap gap-2">
                    {room.inclusions.map((item, idx) => (
                      <span key={idx} className="text-xs px-3 py-1 rounded-full bg-gray-50 text-gray-600 font-light">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-6 border-t border-gray-100">
                  {/* Price */}
                  <div className="text-right">
                    <p className="font-normal text-xl tracking-tight" style={{ color: '#0C375F' }}>
                      {room.price}
                    </p>
                    <p className="text-xs text-gray-400 font-light mt-0.5">per month</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default RoomInventory;