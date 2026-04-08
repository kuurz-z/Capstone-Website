import { useState } from 'react';
import { Ban, Users, Sparkles, HeartHandshake, ShieldCheck, ReceiptText, AlertCircle, ChevronDown } from 'lucide-react';

const rules = [
  {
    icon: Ban,
    title: 'No Smoking Policy',
    description: 'Smoking is strictly prohibited inside rooms and throughout the premises to ensure a clean and healthy environment.',
  },
  {
    icon: Users,
    title: 'Visitor Policy',
    description: 'Visitors are only allowed in designated areas, with room access restrictions depending on accommodation type.',
  },
  {
    icon: Sparkles,
    title: 'Cleanliness Responsibility',
    description: 'All tenants are expected to maintain cleanliness in their rooms and shared spaces at all times.',
  },
  {
    icon: HeartHandshake,
    title: 'Respect and Proper Conduct',
    description: 'Residents must show respect to others and avoid any disruptive or inappropriate behavior.',
  },
  {
    icon: ShieldCheck,
    title: 'Security & RFID Usage',
    description: 'RFID access cards must be kept secure and not shared to maintain safety within the premises.',
  },
  {
    icon: ReceiptText,
    title: 'Payment & Compliance Policy',
    description: 'Timely rental payments and adherence to house rules are required to avoid penalties or contract termination.',
  }
];

export function RulesSection() {
  const [expandedIndex, setExpandedIndex] = useState(0);

  const toggleRule = (index) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <section className="py-20 lg:py-24" style={{ backgroundColor: 'var(--lp-bg)' }}>
      <div className="max-w-screen-2xl mx-auto px-8 lg:px-12">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-xs mb-3 tracking-widest uppercase font-medium" style={{ color: 'var(--lp-accent)' }}>
            Resident Rules
          </p>
          <h2 className="text-3xl lg:text-4xl font-medium mb-5 tracking-tight" style={{ color: 'var(--lp-text)' }}>
            Rules & Policies
          </h2>
          <p className="max-w-2xl mx-auto font-normal leading-relaxed" style={{ color: 'var(--lp-text-secondary)' }}>
            Clear expectations for a safe, respectful, and well-managed living environment for everyone.
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
                aria-expanded={isExpanded}
                className="text-left w-full p-6 rounded-2xl transition-[box-shadow,transform] duration-300 cursor-pointer focus:outline-none"
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
                <div className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: 'var(--lp-icon-bg)' }}
                  >
                    <Icon className="w-5 h-5" style={{ color: 'var(--lp-accent)' }} />
                  </div>
                  <h3 className="text-base font-medium tracking-tight flex-1" style={{ color: 'var(--lp-text)' }}>
                    {rule.title}
                  </h3>
                  <ChevronDown
                    className="w-4 h-4 flex-shrink-0 transition-transform duration-300"
                    style={{
                      color: 'var(--lp-text-muted)',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  />
                </div>
                <div
                  className="overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-in-out"
                  style={{
                    maxHeight: isExpanded ? '120px' : '0px',
                    opacity: isExpanded ? 1 : 0,
                    marginTop: isExpanded ? '12px' : '0px',
                  }}
                >
                  <p className="text-sm leading-relaxed pl-14" style={{ color: 'var(--lp-text-secondary)' }}>
                    {rule.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Important Warning — enhanced visibility */}
        <div
          className="mt-10 p-6 rounded-2xl max-w-3xl mx-auto flex gap-4 items-start"
          style={{
            backgroundColor: 'var(--lp-bg-card)',
            border: '1px solid var(--lp-border)',
            borderLeft: '3px solid var(--lp-accent)',
          }}
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--lp-accent)' }} />
          <p className="text-sm leading-relaxed" style={{ color: 'var(--lp-text-secondary)' }}>
            <span className="font-semibold" style={{ color: 'var(--lp-text)' }}>Important: </span>
            Violation of house rules may result in warnings, fines, or termination of contract. We maintain these policies to ensure a safe and comfortable environment for all residents.
          </p>
        </div>
      </div>
    </section>
  );
}

export default RulesSection;