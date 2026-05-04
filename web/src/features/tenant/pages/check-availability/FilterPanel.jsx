import React from "react";
import { X, Plus, Minus } from "lucide-react";
import ElasticSlider from "../../components/ElasticSlider";

/**
 * Collapsible filter panel for branch, room type, and price range.
 */
const FilterPanel = ({
  show,
  onClose,
  selectedBranch,
  onBranchFilter,
  selectedRoomType,
  onRoomTypeFilter,
  availableRoomTypes,
  maxPrice,
  setMaxPrice,
  filteredCount,
  onClearAll,
}) => {
  if (!show) return null;

  return (
    <div className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: "#0A1628" }}>
            Filters
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Location
            </label>
            <div className="space-y-2">
              {["All", "Gil Puyat", "Guadalupe"].map((loc) => (
                <label
                  key={loc}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="location"
                    checked={selectedBranch === loc}
                    onChange={() => onBranchFilter(loc)}
                    className="w-4 h-4"
                    style={{ accentColor: "#FF8C42" }}
                  />
                  <span className="text-sm text-gray-700 capitalize">
                    {loc === "All" ? "All Locations" : loc}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Room Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Room Type
            </label>
            <div className="space-y-2">
              {availableRoomTypes.map((type) => (
                <label
                  key={type}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="type"
                    checked={selectedRoomType === type}
                    onChange={() => onRoomTypeFilter(type)}
                    className="w-4 h-4"
                    style={{ accentColor: "#FF8C42" }}
                  />
                  <span className="text-sm text-gray-700 capitalize">
                    {type === "All" ? "All Types" : type}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Price Range */}
          <div className="flex flex-col items-center">
            <label className="block text-base font-semibold text-gray-900 mb-6">
              Price Range
            </label>
            <ElasticSlider
              defaultValue={maxPrice}
              startingValue={0}
              maxValue={15000}
              isStepped={true}
              stepSize={100}
              leftIcon={<Minus className="w-5 h-5 text-gray-600" />}
              rightIcon={<Plus className="w-5 h-5 text-gray-600" />}
              onChange={(value) => setMaxPrice(value)}
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClearAll}
            className="px-6 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          >
            Clear All
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg text-white"
            style={{ backgroundColor: "#FF8C42" }}
          >
            Show {filteredCount} Rooms
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilterPanel;
