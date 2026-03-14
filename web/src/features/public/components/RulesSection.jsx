import { useState } from 'react';
import { Clock, Users, Volume2, Sparkles, Shield, AlertCircle, ChevronDown } from 'lucide-react';

const rules = [
  {
    icon: Clock,
    title: 'Curfew Hours',
    description: 'Gate closes at 11:00 PM on weekdays, 12:00 AM on weekends. Late entry requires advance notice.',
    color: '#D4982B'
  },
  {
    icon: Users,
    title: 'Visitor Policy',
    description: 'Visitors allowed in common areas only from 9:00 AM to 9:00 PM. Register at reception desk.',
    color: '#183153'
  },
  {
    icon: Volume2,
    title: 'Quiet Hours',
    description: 'Maintain low noise levels from 10:00 PM to 7:00 AM to respect fellow residents.',
    color: '#EDB938'
  },
  {
    icon: Sparkles,
    title: 'Cleanliness',
    description: 'Keep your room and shared spaces clean. Weekly room inspection by management.',
    color: '#D4982B'
  },
  {
    icon: Shield,
    title: 'Security',
    description: 'Do not share access codes. Report suspicious activity immediately to staff.',
    color: '#183153'
  },
  {
    icon: AlertCircle,
    title: 'Prohibited Items',
    description: 'No illegal substances, weapons, or pets allowed. Cooking in rooms is strictly prohibited.',
    color: '#EDB938'
  }
];

export function RulesSection() {
  const [expandedIndex, setExpandedIndex] = useState(null);

  const toggleRule = (index) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <section className="py-16 lg:py-20 bg-gradient-to-b from-white to-gray-50">
      <div className="max-w-7xl mx-auto px-8 lg:px-12">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-xs text-gray-500 mb-3 tracking-widest uppercase font-medium">House Guidelines</p>
          <h2 className="text-4xl lg:text-5xl font-normal mb-5 tracking-tight" style={{ color: '#183153' }}>
            Rules & Policies
          </h2>
          <p className="text-gray-500 max-w-2xl mx-auto font-normal leading-relaxed">
            Clear expectations for a safe, respectful, and harmonious living environment for everyone.
          </p>
        </div>

        {/* Rules Accordion Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rules.map((rule, index) => {
            const Icon = rule.icon;
            const isExpanded = expandedIndex === index;
            return (
              <button
                key={index}
                onClick={() => toggleRule(index)}
                className="text-left p-6 rounded-2xl bg-white border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2"
                style={{ focusRingColor: rule.color }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${rule.color}15` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: rule.color }} />
                  </div>
                  <h3 className="text-base font-medium tracking-tight flex-1" style={{ color: '#183153' }}>
                    {rule.title}
                  </h3>
                  <ChevronDown
                    className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-300"
                    style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  />
                </div>
                <div
                  className="overflow-hidden transition-all duration-300"
                  style={{
                    maxHeight: isExpanded ? '120px' : '0px',
                    opacity: isExpanded ? 1 : 0,
                    marginTop: isExpanded ? '12px' : '0px',
                  }}
                >
                  <p className="text-sm text-gray-600 leading-relaxed pl-14">
                    {rule.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Additional Info */}
        <div className="mt-10 p-6 rounded-2xl bg-gradient-to-br from-gray-50 to-white border border-gray-100 max-w-3xl mx-auto">
          <p className="text-sm text-gray-600 leading-relaxed text-center">
            <span className="font-semibold" style={{ color: '#183153' }}>Important:</span> Violation of house rules may result in warnings, fines, or termination of contract. We maintain these policies to ensure a safe and comfortable environment for all residents.
          </p>
        </div>
      </div>
    </section>
  );
}

export default RulesSection;