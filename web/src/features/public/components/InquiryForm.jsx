import { useState } from 'react';
import { Send, User, Mail, Phone, Home, Calendar, MessageSquare } from 'lucide-react';

export function InquiryForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    branch: '',
    roomType: '',
    moveInDate: '',
    message: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    // Handle form submission
    console.log('Form submitted:', formData);
    alert('Thank you for your inquiry! We will contact you within 24 hours.');
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <section
      className="py-24 lg:py-32 bg-gradient-to-b from-white to-gray-50"
      id="inquiry"
    >
      <div className="max-w-4xl mx-auto px-8 lg:px-12">
        {/* Header */}
        <div className="text-center mb-16">
          <p className="text-xs text-gray-400 mb-3 tracking-widest uppercase font-light">
            Get Started
          </p>
          <h2
            className="text-4xl lg:text-5xl font-light mb-5 tracking-tight"
            style={{ color: "#0C375F" }}
          >
            Reserve Your Slot Today
          </h2>
          <p className="text-gray-500 max-w-2xl mx-auto font-light leading-relaxed">
            Fill out the form below and our team will reach out within 24 hours
            to schedule a viewing or answer your questions.
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-3xl border border-gray-100 p-8 lg:p-12 shadow-xl"
        >
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            {/* Full Name */}
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-light text-gray-600 mb-2"
              >
                Full Name *
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 focus:border-gray-300 focus:outline-none font-light text-gray-700 transition-colors"
                  placeholder="Juan Dela Cruz"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-light text-gray-600 mb-2"
              >
                Email Address *
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 focus:border-gray-300 focus:outline-none font-light text-gray-700 transition-colors"
                  placeholder="juan@email.com"
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-light text-gray-600 mb-2"
              >
                Phone Number *
              </label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  required
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 focus:border-gray-300 focus:outline-none font-light text-gray-700 transition-colors"
                  placeholder="+63 912 345 6789"
                />
              </div>
            </div>

            {/* Branch */}
            <div>
              <label
                htmlFor="branch"
                className="block text-sm font-light text-gray-600 mb-2"
              >
                Preferred Branch *
              </label>
              <div className="relative">
                <Home className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  id="branch"
                  name="branch"
                  required
                  value={formData.branch}
                  onChange={handleChange}
                  className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 focus:border-gray-300 focus:outline-none font-light text-gray-700 appearance-none transition-colors"
                >
                  <option value="">Select Branch</option>
                  <option value="gil-puyat">Gil Puyat</option>
                  <option value="guadalupe">Guadalupe</option>
                </select>
              </div>
            </div>

            {/* Room Type */}
            <div>
              <label
                htmlFor="roomType"
                className="block text-sm font-light text-gray-600 mb-2"
              >
                Room Type *
              </label>
              <div className="relative">
                <Home className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  id="roomType"
                  name="roomType"
                  required
                  value={formData.roomType}
                  onChange={handleChange}
                  className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 focus:border-gray-300 focus:outline-none font-light text-gray-700 appearance-none transition-colors"
                >
                  <option value="">Select Room Type</option>
                  <option value="private">Private Room</option>
                  <option value="double">Double Occupancy</option>
                  <option value="quadruple">Quadruple Room</option>
                </select>
              </div>
            </div>
          </div>

          {/* Message */}
          <div className="mb-8">
            <label
              htmlFor="message"
              className="block text-sm font-light text-gray-600 mb-2"
            >
              Additional Message (Optional)
            </label>
            <div className="relative">
              <MessageSquare className="absolute left-4 top-4 w-5 h-5 text-gray-400" />
              <textarea
                id="message"
                name="message"
                rows={4}
                value={formData.message}
                onChange={handleChange}
                className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 focus:border-gray-300 focus:outline-none font-light text-gray-700 resize-none transition-colors"
                placeholder="Any questions or special requests?"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full text-white py-4 px-6 rounded-full font-light hover:opacity-90 transition-opacity text-base flex items-center justify-center gap-3"
            style={{ backgroundColor: "#E7710F" }}
          >
            <span>Submit Inquiry</span>
            <Send className="w-5 h-5" />
          </button>

          {/* Privacy Note */}
          <p className="text-xs text-gray-400 text-center mt-6 font-light">
            By submitting this form, you agree to our privacy policy. We will
            never share your information with third parties.
          </p>
        </form>
      </div>
    </section>
  );
}

export default InquiryForm;