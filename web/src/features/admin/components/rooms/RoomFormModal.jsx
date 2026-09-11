import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Building2,
  MapPin,
  User,
  Users,
  LayoutGrid,
  ImagePlus,
  DollarSign,
  FileText,
  LoaderCircle,
  Trash2,
  X,
  Plus,
  Star,
  Check,
  ShieldAlert,
  Percent,
  Tag,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Layers,
  Maximize2,
} from "lucide-react";
import { BRANCH_OPTIONS } from "../../../../shared/utils/constants";
import { uploadRoomPhotoIfFile } from "../../../../shared/utils/firebaseStorageUpload";
import useEscapeClose from "../../../../shared/hooks/useEscapeClose";
import { useAuth } from "../../../../shared/hooks/useAuth";
import { useBusinessSettings } from "../../../../shared/hooks/queries/useSettings";
import { useRooms } from "../../../../shared/hooks/queries/useRooms";
import {
  getBranchFloors,
  getNextFloorOption,
  getNextRoomNumberForFloor,
  isRoomNumberDuplicate,
} from "../../utils/roomNumberingUtils";
import { showNotification } from "../../../../shared/utils/notification";
import getFriendlyError from "../../../../shared/utils/friendlyError";
import { getThumbnailUrl, getImageFallbackUrl, prefetchOptimizedImage } from "../../../../shared/utils/imageOptimizer";
import RoomImageLightboxModal from "./RoomImageLightboxModal";

/**
 * Generate default beds based on room type and capacity.
 * - private → 1 bunk (upper + lower) for 1 tenant
 * - double-sharing → 1 upper + 1 lower per bunk
 * - quadruple-sharing → 2 upper + 2 lower per bunk pair
 */
function generateBeds(type, capacity) {
  const beds = [];

  if (type === "private") {
    // Private = 1 tenant but 2 beds (1 bunk: upper + lower)
    beds.push({ id: "bed-1", position: "upper", status: "available" });
    beds.push({ id: "bed-2", position: "lower", status: "available" });
  } else {
    for (let i = 1; i <= capacity; i++) {
      const position = i % 2 === 1 ? "upper" : "lower";
      beds.push({ id: `bed-${i}`, position, status: "available" });
    }
  }

  return beds;
}

/** Field Limit Constants */
const LIMITS = {
  NAME_MIN: 2,
  NAME_MAX: 50,
  ROOM_NUMBER_MIN: 1,
  ROOM_NUMBER_MAX: 10,
  FLOOR_MIN: 1,
  FLOOR_MAX: 100,
  PRICE_MIN: 500,
  PRICE_MAX: 1000000,
  DESCRIPTION_MAX: 500,
  AMENITY_MAX: 50,
  POLICY_MAX: 60,
  MAX_IMAGE_SIZE_BYTES: 5 * 1024 * 1024,
};

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

/** Locked capacity values per room type */
const CAPACITY_BY_TYPE = {
  private: 1,
  "double-sharing": 2,
  "quadruple-sharing": 4,
};

/** Standard base rates per room type */
const STANDARD_ROOM_RATES = {
  private: { basePrice: 15000, shortTermRate: 16000 },
  "double-sharing": { basePrice: 9000, shortTermRate: 10000 },
  "quadruple-sharing": { basePrice: 6000, shortTermRate: 7000 },
};

const ROOM_TYPE_META = {
  private: { label: "Private", description: "1 tenant · 1 bunk bed", icon: User },
  "double-sharing": { label: "Double Sharing", description: "2 tenants · 2 beds", icon: Users },
  "quadruple-sharing": { label: "Quadruple Sharing", description: "4 tenants · 4 beds", icon: LayoutGrid },
};

const AMENITY_PRESETS = [
  "Air Conditioning",
  "WiFi",
  "Double Decker Bed",
  "Study Desk",
  "Cabinet / Wardrobe",
  "Water Heater",
  "Personal Locker",
  "Electric Fan",
  "Window View",
  "Balcony",
];

const POLICY_PRESETS = [
  "No Smoking",
  "No Pets",
  "Quiet Hours (10PM - 6AM)",
  "Visitors until 8PM",
  "Valid ID Required",
  "Clean As You Go (CLAYGO)",
];

const INITIAL_FORM = {
  name: "",
  roomNumber: "",
  branch: "gil-puyat",
  type: "",
  floor: 1,
  capacity: 0,
  price: "",
  monthlyPrice: 0,
  description: "",
  amenities: [],
  policies: [],
  images: [],
};

const makeImageId = () =>
  `room-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildImageState = (value) => ({
  id: makeImageId(),
  value,
  preview: typeof value === "string" ? getThumbnailUrl(value) : URL.createObjectURL(value),
  name: typeof value === "string" ? "Uploaded image" : value.name,
});

const normalizeList = (val) => {
  if (Array.isArray(val)) return val.map((s) => String(s).trim()).filter(Boolean);
  if (typeof val === "string") return val.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
};

export default function RoomFormModal({ room, onClose, onSave }) {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const isEdit = Boolean(room);

  // Business settings for live discount pricing
  const { data: businessSettingsData } = useBusinessSettings();
  const settings = businessSettingsData?.data || businessSettingsData || {};

  // Fetch all rooms for dynamic floor calculation and sequential numbering
  const { data: roomsData } = useRooms();
  const allRooms = useMemo(() => {
    if (Array.isArray(roomsData)) return roomsData;
    if (Array.isArray(roomsData?.data)) return roomsData.data;
    if (Array.isArray(roomsData?.items)) return roomsData.items;
    return [];
  }, [roomsData]);

  const [form, setForm] = useState(() => ({
    ...INITIAL_FORM,
    branch: room?.branch || user?.branch || "gil-puyat",
  }));

  const [isRoomNumberCustomized, setIsRoomNumberCustomized] = useState(() => isEdit);

  const [initialSnapshot, setInitialSnapshot] = useState(null);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // Custom tags input state
  const [customAmenity, setCustomAmenity] = useState("");
  const [customPolicy, setCustomPolicy] = useState("");

  // Lock body scroll on mount
  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, []);

  // Compute floors for the selected branch
  const branchFloors = useMemo(() => {
    return getBranchFloors(allRooms, form.branch);
  }, [allRooms, form.branch]);

  // Compute next floor option
  const nextFloorOption = useMemo(() => {
    return getNextFloorOption(branchFloors);
  }, [branchFloors]);

  // Branch label for friendly UI text
  const branchLabel = useMemo(() => {
    return BRANCH_OPTIONS.find((b) => b.value === form.branch)?.label || form.branch;
  }, [form.branch]);

  // Real-time duplicate room number detection
  const isDuplicateNumber = useMemo(() => {
    if (!form.roomNumber) return false;
    return isRoomNumberDuplicate(allRooms, form.branch, form.roomNumber, room?._id);
  }, [allRooms, form.branch, form.roomNumber, room?._id]);

  // Suggested room number for edit mode when floor changes
  const suggestedForEditFloor = useMemo(() => {
    if (!isEdit || !form.floor) return null;
    return getNextRoomNumberForFloor(allRooms, form.branch, form.floor);
  }, [isEdit, allRooms, form.branch, form.floor]);

  // Initialize or populate form
  useEffect(() => {
    if (room) {
      const populated = {
        name: room.name || "",
        roomNumber: room.roomNumber || "",
        branch: room.branch || user?.branch || "gil-puyat",
        type: room.type || "",
        floor: room.floor || 1,
        capacity: room.capacity || (room.type ? CAPACITY_BY_TYPE[room.type] : 0),
        price:
          room.price !== undefined && room.price !== null
            ? String(room.price)
            : room.type && STANDARD_ROOM_RATES[room.type]?.basePrice
            ? String(STANDARD_ROOM_RATES[room.type].basePrice)
            : "",
        monthlyPrice: room.monthlyPrice || 0,
        description: room.description || "",
        amenities: normalizeList(room.amenities),
        policies: normalizeList(room.policies),
        images: (room.images || []).map(buildImageState),
      };
      setForm(populated);
      setInitialSnapshot(JSON.stringify(populated));
      setIsRoomNumberCustomized(true);
    } else {
      const targetBranch = user?.branch || "gil-puyat";
      const availableFloors = getBranchFloors(allRooms, targetBranch);
      const initialFloor = availableFloors[0] || 1;
      const initialSuggestedRoom = getNextRoomNumberForFloor(allRooms, targetBranch, initialFloor);

      const initial = {
        ...INITIAL_FORM,
        branch: targetBranch,
        floor: initialFloor,
        roomNumber: initialSuggestedRoom,
        name: initialSuggestedRoom ? `Room ${initialSuggestedRoom}` : "",
      };
      setForm(initial);
      setInitialSnapshot(JSON.stringify(initial));
      setIsRoomNumberCustomized(false);
    }
  }, [room, user?.branch]);

  // Automatic room numbering & naming synchronization when branch/floor changes in Add mode
  useEffect(() => {
    if (isEdit || isRoomNumberCustomized) return;
    if (!form.branch || !form.floor) return;

    const suggestedNumber = getNextRoomNumberForFloor(allRooms, form.branch, form.floor);
    if (!suggestedNumber) return;

    setForm((prev) => {
      if (prev.roomNumber === suggestedNumber) return prev;

      const currentName = (prev.name || "").trim();
      const prevNumber = (prev.roomNumber || "").trim();
      const isDefaultOrMatchesRoom =
        !currentName ||
        currentName.toLowerCase() === "room" ||
        (prevNumber && currentName.toLowerCase() === `room ${prevNumber}`.toLowerCase());

      const nextName = isDefaultOrMatchesRoom ? `Room ${suggestedNumber}` : prev.name;

      const updated = {
        ...prev,
        roomNumber: suggestedNumber,
        name: nextName,
      };

      // Keep initialSnapshot in sync if the user has not yet touched the form
      setInitialSnapshot((prevSnap) => {
        try {
          const parsed = JSON.parse(prevSnap);
          if (!parsed.type && !parsed.description && (!parsed.images || parsed.images.length === 0)) {
            return JSON.stringify(updated);
          }
        } catch {
          // ignore
        }
        return prevSnap;
      });

      return updated;
    });
  }, [isEdit, isRoomNumberCustomized, form.branch, form.floor, allRooms]);

  // Apply suggested room number in edit mode
  const handleApplySuggestedForFloor = useCallback(() => {
    if (!suggestedForEditFloor) return;
    setForm((prev) => {
      const currentName = (prev.name || "").trim();
      const prevNumber = (prev.roomNumber || "").trim();
      const isDefaultOrMatchesRoom =
        !currentName ||
        currentName.toLowerCase() === "room" ||
        (prevNumber && currentName.toLowerCase() === `room ${prevNumber}`.toLowerCase());

      return {
        ...prev,
        roomNumber: suggestedForEditFloor,
        name: isDefaultOrMatchesRoom ? `Room ${suggestedForEditFloor}` : prev.name,
      };
    });
    if (touched.roomNumber) {
      validateField("roomNumber", suggestedForEditFloor);
    }
  }, [suggestedForEditFloor, touched.roomNumber]);

  // Check if form has unsaved modifications
  const isFormDirty = useCallback(() => {
    if (!initialSnapshot) return false;
    const currentComparable = {
      ...form,
      images: (form.images || []).map((img) => img.name || img.preview),
    };
    try {
      const initialParsed = JSON.parse(initialSnapshot);
      const initialComparable = {
        ...initialParsed,
        images: (initialParsed.images || []).map((img) => img.name || img.preview),
      };
      return JSON.stringify(currentComparable) !== JSON.stringify(initialComparable);
    } catch {
      return false;
    }
  }, [form, initialSnapshot]);

  // Intercept close requests
  const handleAttemptClose = useCallback(() => {
    if (isFormDirty()) {
      setShowConfirmClose(true);
    } else {
      onClose();
    }
  }, [isFormDirty, onClose]);

  // Escape key handler
  useEscapeClose(lightboxIndex === null, () => {
    if (showConfirmClose) {
      setShowConfirmClose(false);
    } else {
      handleAttemptClose();
    }
  });

  // Calculate live long-term discount rates directly from System Settings standard room rates
  const pricingSummary = useMemo(() => {
    if (!form.type || !STANDARD_ROOM_RATES[form.type]) return null;
    const { basePrice, shortTermRate } = STANDARD_ROOM_RATES[form.type];

    const isDiscountEnabled = settings?.isDiscountEnabled !== false;
    let discountPercent = 0;

    if (form.type === "private") {
      discountPercent = settings?.privateDiscountPercent ?? 10;
    } else if (form.type === "double-sharing") {
      discountPercent = settings?.doubleDiscountPercent ?? 20;
    } else if (form.type === "quadruple-sharing") {
      discountPercent =
        settings?.quadrupleDiscountPercent ?? settings?.defaultLongTermDiscountPercent ?? 10;
    }

    const effectiveDiscount = isDiscountEnabled ? Number(discountPercent) || 0 : 0;
    const discountedPrice = effectiveDiscount > 0
      ? Math.round(basePrice * (1 - effectiveDiscount / 100))
      : basePrice;
    const monthlySavings = Math.max(0, basePrice - discountedPrice);
    const minMonths = settings?.longTermLeaseMinMonths || 6;

    return {
      basePrice,
      shortTermRate,
      isDiscountEnabled: isDiscountEnabled && effectiveDiscount > 0,
      discountPercent: effectiveDiscount,
      discountedPrice,
      monthlySavings,
      minMonths,
    };
  }, [form.type, settings]);

  const handleChange = (field, value) => {
    let nextValue = value;

    if (field === "name") {
      // Room name: letters, numbers, hyphens, and spaces; max 50 chars
      nextValue = value.replace(/[^a-zA-Z0-9\s-]/g, "").slice(0, LIMITS.NAME_MAX);
    } else if (field === "roomNumber") {
      // Room number: numbers only; max 10 digits
      nextValue = value.replace(/\D/g, "").slice(0, LIMITS.ROOM_NUMBER_MAX);
    } else if (field === "floor") {
      // Floor: positive integer only, max 3 digits
      const digitsOnly = String(value).replace(/[^0-9]/g, "").slice(0, 3);
      nextValue = digitsOnly === "" ? "" : digitsOnly;
    } else if (field === "price") {
      // Price: positive integer digits only, max 7 digits (up to 1,000,000)
      const digitsOnly = String(value).replace(/[^0-9]/g, "").slice(0, 7);
      nextValue = digitsOnly === "" ? "" : digitsOnly;
    }

    setForm((prev) => {
      const updated = { ...prev, [field]: nextValue };
      if (field === "roomNumber") {
        // If room name is empty, "Room", or previously auto-named with the old room number, sync with new room number
        const currentName = prev.name.trim();
        const prevNumber = prev.roomNumber.trim();
        const isDefaultOrMatchesRoom =
          !currentName ||
          currentName.toLowerCase() === "room" ||
          (prevNumber && currentName.toLowerCase() === `room ${prevNumber}`.toLowerCase());

        if (isDefaultOrMatchesRoom) {
          updated.name = nextValue ? `Room ${nextValue}` : currentName.toLowerCase().startsWith("room") ? "Room" : currentName;
        }
      }
      if (field === "type") {
        updated.capacity = CAPACITY_BY_TYPE[nextValue] ?? 0;
        if (STANDARD_ROOM_RATES[nextValue]?.basePrice) {
          updated.price = String(STANDARD_ROOM_RATES[nextValue].basePrice);
        }
      }
      return updated;
    });

    if (touched[field] || field === "type") {
      validateField(field, nextValue);
    }
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    validateField(field, form[field]);
  };

  const validateField = (field, value) => {
    let err = null;

    if (field === "name") {
      const trimmed = String(value || "").trim();
      if (!trimmed) {
        err = "Room name is required";
      } else if (trimmed.length < LIMITS.NAME_MIN) {
        err = `Room name must be at least ${LIMITS.NAME_MIN} characters`;
      } else if (trimmed.length > LIMITS.NAME_MAX) {
        err = `Room name cannot exceed ${LIMITS.NAME_MAX} characters`;
      } else if (!/^[a-zA-Z0-9\s-]+$/.test(trimmed)) {
        err = "Room name must contain letters, numbers, hyphens, and spaces only";
      }
    }

    if (field === "roomNumber") {
      const trimmed = String(value || "").trim();
      if (!trimmed) {
        err = "Room number is required";
      } else if (trimmed.length > LIMITS.ROOM_NUMBER_MAX) {
        err = `Room number cannot exceed ${LIMITS.ROOM_NUMBER_MAX} digits`;
      } else if (!/^[0-9]+$/.test(trimmed)) {
        err = "Room number must contain numbers only";
      } else if (isRoomNumberDuplicate(allRooms, form.branch, trimmed, room?._id)) {
        err = `Room number ${trimmed} already exists in ${branchLabel}`;
      }
    }

    if (field === "type") {
      if (!value || !["private", "double-sharing", "quadruple-sharing"].includes(value)) {
        err = "Room type is required";
      }
    }

    if (field === "price") {
      if (value === "" || value === null || value === undefined) {
        err = "Base price is required";
      } else {
        const num = Number(value);
        if (isNaN(num) || num < LIMITS.PRICE_MIN) {
          err = `Base rent must be at least ₱${LIMITS.PRICE_MIN.toLocaleString()}/month`;
        } else if (num > LIMITS.PRICE_MAX) {
          err = `Base rent cannot exceed ₱${LIMITS.PRICE_MAX.toLocaleString()}/month`;
        }
      }
    }

    if (field === "floor") {
      if (value === "" || value === null || value === undefined) {
        err = "Floor is required";
      } else {
        const num = Number(value);
        if (isNaN(num) || !Number.isInteger(num) || num < LIMITS.FLOOR_MIN) {
          err = `Floor must be a whole number between ${LIMITS.FLOOR_MIN} and ${LIMITS.FLOOR_MAX}`;
        } else if (num > LIMITS.FLOOR_MAX) {
          err = `Floor cannot exceed ${LIMITS.FLOOR_MAX}`;
        }
      }
    }

    if (field === "description") {
      if (value && String(value).length > LIMITS.DESCRIPTION_MAX) {
        err = `Description cannot exceed ${LIMITS.DESCRIPTION_MAX} characters`;
      }
    }

    setErrors((prev) => ({ ...prev, [field]: err }));
    return !err;
  };

  const validate = () => {
    const newErrors = {};

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      newErrors.name = "Room name is required";
    } else if (trimmedName.length < LIMITS.NAME_MIN) {
      newErrors.name = `Room name must be at least ${LIMITS.NAME_MIN} characters`;
    } else if (trimmedName.length > LIMITS.NAME_MAX) {
      newErrors.name = `Room name cannot exceed ${LIMITS.NAME_MAX} characters`;
    } else if (!/^[a-zA-Z0-9\s-]+$/.test(trimmedName)) {
      newErrors.name = "Room name must contain letters, numbers, hyphens, and spaces only";
    }

    const trimmedNumber = form.roomNumber.trim();
    if (!trimmedNumber) {
      newErrors.roomNumber = "Room number is required";
    } else if (trimmedNumber.length > LIMITS.ROOM_NUMBER_MAX) {
      newErrors.roomNumber = `Room number cannot exceed ${LIMITS.ROOM_NUMBER_MAX} digits`;
    } else if (!/^[0-9]+$/.test(trimmedNumber)) {
      newErrors.roomNumber = "Room number must contain numbers only";
    } else if (isRoomNumberDuplicate(allRooms, form.branch, trimmedNumber, room?._id)) {
      newErrors.roomNumber = `Room number ${trimmedNumber} already exists in ${branchLabel}`;
    }

    if (!form.type || !["private", "double-sharing", "quadruple-sharing"].includes(form.type)) {
      newErrors.type = "Room type is required";
    }

    if (!form.capacity || form.capacity < 1) {
      newErrors.capacity = "Capacity must be at least 1";
    }

    if (form.floor === "" || form.floor === null || form.floor === undefined) {
      newErrors.floor = "Floor is required";
    } else {
      const num = Number(form.floor);
      if (isNaN(num) || !Number.isInteger(num) || num < LIMITS.FLOOR_MIN) {
        newErrors.floor = `Floor must be a whole number between ${LIMITS.FLOOR_MIN} and ${LIMITS.FLOOR_MAX}`;
      } else if (num > LIMITS.FLOOR_MAX) {
        newErrors.floor = `Floor cannot exceed ${LIMITS.FLOOR_MAX}`;
      }
    }

    if (form.description && form.description.length > LIMITS.DESCRIPTION_MAX) {
      newErrors.description = `Description cannot exceed ${LIMITS.DESCRIPTION_MAX} characters`;
    }

    setErrors(newErrors);
    setTouched({
      name: true,
      roomNumber: true,
      type: true,
      floor: true,
    });
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      showNotification("Please review the highlighted fields to ensure all room details are valid.", "warning", 4000);
      return;
    }

    setSaving(true);
    let onSaveCalled = false;
    try {
      const storageRoomId = room?._id ? String(room._id) : `new-${Date.now()}`;
      const uploadedImages = await Promise.all(
        (form.images || []).map((entry) => uploadRoomPhotoIfFile(entry.value, storageRoomId)),
      );

      const baseRates = STANDARD_ROOM_RATES[form.type] || { basePrice: 15000, shortTermRate: 16000 };
      const payload = {
        name: form.name.trim(),
        roomNumber: form.roomNumber.trim(),
        branch: form.branch,
        type: form.type,
        floor: Number(form.floor),
        capacity: Number(form.capacity),
        price: baseRates.basePrice,
        regularLongRate: baseRates.basePrice,
        regularShortRate: baseRates.shortTermRate,
        description: form.description.trim(),
        amenities: form.amenities || [],
        policies: form.policies || [],
        images: uploadedImages.filter(Boolean),
      };

      if (!isEdit) {
        payload.beds = generateBeds(payload.type, payload.capacity);
      }

      onSaveCalled = true;
      await onSave(payload, room?._id);
    } catch (err) {
      console.error("[RoomFormModal] Save room failed:", err);
      if (!onSaveCalled) {
        const errorMessage = getFriendlyError(
          err,
          "Unable to save room details. Please check the entered information and try again.",
        );
        showNotification(errorMessage, "error", 5000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleImageSelection = (event) => {
    const selectedFiles = Array.from(event.target.files || []).filter(Boolean);
    if (selectedFiles.length === 0) return;

    const validFiles = [];
    let oversizedCount = 0;
    let invalidTypeCount = 0;

    selectedFiles.forEach((file) => {
      if (file.type && !ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
        invalidTypeCount++;
        return;
      }
      if (file.size > LIMITS.MAX_IMAGE_SIZE_BYTES) {
        oversizedCount++;
        return;
      }
      validFiles.push(file);
    });

    if (invalidTypeCount > 0) {
      showNotification("Some files were skipped. Only JPEG, PNG, and WebP images are supported.", "warning", 4000);
    }

    if (oversizedCount > 0) {
      showNotification("Some files were skipped because they exceed the 5 MB size limit.", "warning", 4000);
    }

    if (validFiles.length > 0) {
      setForm((prev) => ({
        ...prev,
        images: [...(prev.images || []), ...validFiles.map(buildImageState)],
      }));
    }

    event.target.value = "";
  };

  const handleRemoveImage = (imageId) => {
    setForm((prev) => ({
      ...prev,
      images: (prev.images || []).filter((entry) => entry.id !== imageId),
    }));
  };

  // ── Amenities Tag Helpers ──
  const handleAddAmenity = (text) => {
    const clean = text.trim().slice(0, LIMITS.AMENITY_MAX);
    if (!clean) return;
    if (form.amenities.includes(clean)) {
      setCustomAmenity("");
      return;
    }
    setForm((prev) => ({
      ...prev,
      amenities: [...prev.amenities, clean],
    }));
    setCustomAmenity("");
  };

  const handleToggleAmenityPreset = (preset) => {
    setForm((prev) => {
      const exists = prev.amenities.includes(preset);
      return {
        ...prev,
        amenities: exists
          ? prev.amenities.filter((item) => item !== preset)
          : [...prev.amenities, preset],
      };
    });
  };

  const handleRemoveAmenity = (indexToRemove) => {
    setForm((prev) => ({
      ...prev,
      amenities: prev.amenities.filter((_, idx) => idx !== indexToRemove),
    }));
  };

  // ── Policies Tag Helpers ──
  const handleAddPolicy = (text) => {
    const clean = text.trim().slice(0, LIMITS.POLICY_MAX);
    if (!clean) return;
    if (form.policies.includes(clean)) {
      setCustomPolicy("");
      return;
    }
    setForm((prev) => ({
      ...prev,
      policies: [...prev.policies, clean],
    }));
    setCustomPolicy("");
  };

  const handleTogglePolicyPreset = (preset) => {
    setForm((prev) => {
      const exists = prev.policies.includes(preset);
      return {
        ...prev,
        policies: exists
          ? prev.policies.filter((item) => item !== preset)
          : [...prev.policies, preset],
      };
    });
  };

  const handleRemovePolicy = (indexToRemove) => {
    setForm((prev) => ({
      ...prev,
      policies: prev.policies.filter((_, idx) => idx !== indexToRemove),
    }));
  };

  const effectivePrice =
    Number(form.price) ||
    (form.type && STANDARD_ROOM_RATES[form.type]?.basePrice ? STANDARD_ROOM_RATES[form.type].basePrice : 0);

  const isFormValid =
    form.name.trim().length >= LIMITS.NAME_MIN &&
    form.name.trim().length <= LIMITS.NAME_MAX &&
    /^[a-zA-Z0-9\s-]+$/.test(form.name.trim()) &&
    form.roomNumber.trim().length >= LIMITS.ROOM_NUMBER_MIN &&
    form.roomNumber.trim().length <= LIMITS.ROOM_NUMBER_MAX &&
    /^[0-9]+$/.test(form.roomNumber.trim()) &&
    !isDuplicateNumber &&
    Boolean(form.type) &&
    ["private", "double-sharing", "quadruple-sharing"].includes(form.type) &&
    Number(form.capacity) >= 1 &&
    effectivePrice >= LIMITS.PRICE_MIN &&
    effectivePrice <= LIMITS.PRICE_MAX &&
    Number(form.floor) >= LIMITS.FLOOR_MIN &&
    Number(form.floor) <= LIMITS.FLOOR_MAX;

  return createPortal(
    <>
      <div className="admin-modal-overlay" onClick={handleAttemptClose} role="dialog" aria-modal="true">
        <div
          className="admin-modal-content room-form-wide rfm-friendly-modal"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Friendly Header with Icon Badge ── */}
          <div className="admin-modal-header rfm-friendly-header">
            <div className="rfm-friendly-header__title-block">
              <div className="rfm-friendly-header__icon-badge">
                <Building2 size={22} className="rfm-friendly-header__icon" />
              </div>
              <div>
                <h2>{isEdit ? `Edit Room` : "Add New Room"}</h2>
                <p className="rfm-friendly-header__subtitle">
                  {isEdit
                    ? `Editing details and configurations for ${room.name || "selected room"}`
                    : "Configure room specifications, capacity, pricing, and amenities for your tenants."}
                </p>
              </div>
            </div>
            <button
              className="modal-close-btn"
              onClick={handleAttemptClose}
              aria-label="Close modal"
              type="button"
            >
              <X size={20} />
            </button>
          </div>

          <form
            id="room-form"
            onSubmit={handleSubmit}
            style={{ display: "contents" }}
          >
            <div className="admin-modal-body rfm-friendly-body">

              {/* ── Card 1: Basic Information & Location ── */}
              <section className="rfm-card-group">
                <div className="rfm-card-group__header">
                  <div className="rfm-card-group__title-wrap">
                    <span className="rfm-card-group__step-num">1</span>
                    <Building2 size={16} className="rfm-card-group__icon" />
                    <h3>Basic Details &amp; Location</h3>
                  </div>
                  <span className="rfm-card-group__hint">Name, room number, branch and floor</span>
                </div>

                <div className="rfm-card-group__body">
                  <div className="room-form-row">
                    {/* Room Name */}
                    <div className={`room-form-group ${touched.name && errors.name ? "has-error" : ""}`}>
                      <div className="rfm-field-header">
                        <label htmlFor="rfm-name">
                          Room Name <span className="rfm-required">*</span>
                        </label>
                        <span className="rfm-char-counter">{form.name.length}/{LIMITS.NAME_MAX}</span>
                      </div>
                      <input
                        id="rfm-name"
                        type="text"
                        spellCheck={false}
                        maxLength={LIMITS.NAME_MAX}
                        autoFocus={!isEdit}
                        value={form.name}
                        onChange={(e) => handleChange("name", e.target.value)}
                        onBlur={() => handleBlur("name")}
                        placeholder="e.g. Deluxe Room"
                      />
                      {touched.name && errors.name && (
                        <span className="field-error" role="alert">
                          <AlertCircle size={12} className="shrink-0" />
                          {errors.name}
                        </span>
                      )}
                    </div>

                    {/* Room Number */}
                    <div className={`room-form-group ${(touched.roomNumber && errors.roomNumber) || isDuplicateNumber ? "has-error" : ""}`}>
                      <div className="rfm-field-header">
                        <label htmlFor="rfm-number">
                          Room Number <span className="rfm-required">*</span>
                        </label>
                        <span className="rfm-char-counter">{form.roomNumber.length}/{LIMITS.ROOM_NUMBER_MAX}</span>
                      </div>
                      <input
                        id="rfm-number"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        spellCheck={false}
                        maxLength={LIMITS.ROOM_NUMBER_MAX}
                        value={form.roomNumber}
                        onChange={(e) => {
                          if (!isEdit) {
                            setIsRoomNumberCustomized(true);
                          }
                          handleChange("roomNumber", e.target.value);
                        }}
                        onBlur={() => handleBlur("roomNumber")}
                        placeholder="e.g. 101"
                      />

                      {/* Edit mode floor change suggestion */}
                      {isEdit && String(form.floor) !== String(room?.floor) && suggestedForEditFloor && form.roomNumber !== suggestedForEditFloor && (
                        <div className="rfm-floor-change-suggestion">
                          <span>
                            Floor changed: Suggested for Floor {form.floor} is <strong>Room {suggestedForEditFloor}</strong>
                          </span>
                          <button
                            type="button"
                            className="rfm-apply-suggestion-btn"
                            onClick={handleApplySuggestedForFloor}
                            title="Apply suggested room number for this floor"
                          >
                            Apply
                          </button>
                        </div>
                      )}

                      {((touched.roomNumber && errors.roomNumber) || isDuplicateNumber) && (
                        <span className="field-error" role="alert">
                          <AlertCircle size={12} className="shrink-0" />
                          {errors.roomNumber || `Room number ${form.roomNumber} already exists in ${branchLabel}`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="room-form-row">
                    {/* Branch */}
                    <div className="room-form-group">
                      <label htmlFor="rfm-branch">Branch <span className="rfm-required">*</span></label>
                      <select
                        id="rfm-branch"
                        value={form.branch}
                        onChange={(e) => handleChange("branch", e.target.value)}
                        disabled={!isOwner}
                        title={!isOwner ? "Branch admins can only configure rooms for their assigned branch" : undefined}
                      >
                        {BRANCH_OPTIONS.map((branch) => (
                          <option key={branch.value} value={branch.value}>
                            {branch.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Floor */}
                    <div className={`room-form-group ${touched.floor && errors.floor ? "has-error" : ""}`}>
                      <div className="rfm-field-header">
                        <label htmlFor="rfm-floor">Floor <span className="rfm-required">*</span></label>
                        <span className="rfm-char-counter">
                          {branchFloors.length} {branchFloors.length === 1 ? "floor" : "floors"} active
                        </span>
                      </div>

                      <div className="rfm-floor-input-wrap">
                        <input
                          id="rfm-floor"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          list="rfm-floor-options"
                          value={form.floor}
                          onChange={(e) => handleChange("floor", e.target.value)}
                          onBlur={() => handleBlur("floor")}
                          placeholder="e.g. 2, 3, or type custom floor"
                          autoComplete="off"
                        />
                        <datalist id="rfm-floor-options">
                          {branchFloors.map((f) => (
                            <option key={f} value={String(f)}>
                              Floor {f}
                            </option>
                          ))}
                          {!branchFloors.includes(nextFloorOption) && (
                            <option value={String(nextFloorOption)}>
                              + Add Floor (Floor {nextFloorOption})
                            </option>
                          )}
                        </datalist>
                      </div>

                      {touched.floor && errors.floor && (
                        <span className="field-error" role="alert">
                          <AlertCircle size={12} className="shrink-0" />
                          {errors.floor}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Card 2: Room Type & Capacity ── */}
              <section className="rfm-card-group">
                <div className="rfm-card-group__header">
                  <div className="rfm-card-group__title-wrap">
                    <span className="rfm-card-group__step-num">2</span>
                    <Users size={16} className="rfm-card-group__icon" />
                    <h3>
                      Room Type &amp; Capacity <span className="rfm-required">*</span>
                    </h3>
                  </div>
                  <span className="rfm-card-group__hint">Select occupancy classification</span>
                </div>

                <div className="rfm-card-group__body">
                  <div className="rfm-type-grid" role="radiogroup" aria-label="Room Type Selection">
                    {Object.entries(ROOM_TYPE_META).map(([value, meta]) => {
                      const TypeIcon = meta.icon || LayoutGrid;
                      const isSelected = form.type === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          className={`rfm-type-card ${isSelected ? "rfm-type-card--active" : ""}`}
                          onClick={() => {
                            handleChange("type", value);
                            setTouched((prev) => ({ ...prev, type: true }));
                          }}
                        >
                          <div className="rfm-type-card__header">
                            <TypeIcon size={18} className="rfm-type-card__type-icon" />
                            {isSelected && (
                              <span className="rfm-type-card__check-dot" aria-hidden="true">
                                <Check size={11} strokeWidth={2.5} />
                              </span>
                            )}
                          </div>
                          <span className="rfm-type-card__label">{meta.label}</span>
                          <span className="rfm-type-card__desc">{meta.description}</span>
                        </button>
                      );
                    })}
                  </div>

                  {touched.type && errors.type && (
                    <span className="field-error" role="alert">
                      <AlertCircle size={12} className="shrink-0" />
                      {errors.type}
                    </span>
                  )}

                  {/* Clean neutral capacity note */}
                  {form.type && ROOM_TYPE_META[form.type] ? (
                    <div className="rfm-capacity-badge">
                      <Users size={13} />
                      <span>
                        Capacity locked at <strong>{form.capacity}</strong> tenant{form.capacity !== 1 ? "s" : ""} for {ROOM_TYPE_META[form.type]?.label}
                      </span>
                    </div>
                  ) : (
                    <div className="rfm-capacity-badge">
                      <Users size={13} />
                      <span>Please select an occupancy classification above to set capacity</span>
                    </div>
                  )}
                </div>
              </section>

              {/* ── Card 3: Pricing & Lease Terms ── */}
              <section className="rfm-card-group">
                <div className="rfm-card-group__header">
                  <div className="rfm-card-group__title-wrap">
                    <span className="rfm-card-group__step-num">3</span>
                    <DollarSign size={16} className="rfm-card-group__icon" />
                    <h3>Pricing &amp; Rent Billing</h3>
                  </div>
                  <span className="rfm-card-group__hint">Automated rates from System Settings</span>
                </div>

                <div className="rfm-card-group__body">
                  {pricingSummary ? (
                    <div className="rfm-pricing-preview" style={{ marginTop: 0 }}>
                      <div className="rfm-pricing-preview__grid" style={{ gridTemplateColumns: "1fr" }}>
                        <div className="rfm-pricing-preview__card">
                          <span className="rfm-pricing-preview__label">Base Monthly Rent</span>
                          <span className="rfm-pricing-preview__value">
                            ₱{pricingSummary.basePrice.toLocaleString("en-PH")}/mo
                          </span>
                          <span className="rfm-pricing-preview__sub">
                            Standard rate for {ROOM_TYPE_META[form.type]?.label} (discounts apply dynamically based on applicant's lease term)
                          </span>
                        </div>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted-foreground)" }}>
                        ℹ Room base rates are managed globally in <strong>System Settings</strong>.
                      </div>
                    </div>
                  ) : (
                    <div className="rfm-capacity-badge">
                      <DollarSign size={13} />
                      <span>Please select an occupancy classification above to view room base price</span>
                    </div>
                  )}
                </div>
              </section>

              {/* ── Card 4: Room Photos ── */}
              <section className="rfm-card-group">
                <div className="rfm-card-group__header">
                  <div className="rfm-card-group__title-wrap">
                    <span className="rfm-card-group__step-num">4</span>
                    <ImagePlus size={16} className="rfm-card-group__icon" />
                    <h3>Room Photos</h3>
                  </div>
                  <span className="rfm-card-group__hint">Showcase room interior and facilities</span>
                </div>

                <div className="rfm-card-group__body">
                  {form.images?.length > 0 ? (
                    <div className="image-preview-grid">
                      {form.images.map((entry, index) => (
                        <article
                          key={entry.id}
                          className="image-preview-card group"
                          style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
                        >
                          {index === 0 && (
                            <span className="rfm-cover-photo-badge">
                              <Star size={10} />
                              Cover Photo
                            </span>
                          )}
                          <div
                            className="relative cursor-pointer overflow-hidden"
                            onClick={() => setLightboxIndex(index)}
                            onMouseEnter={() => prefetchOptimizedImage(entry.value)}
                            role="button"
                            tabIndex={0}
                            title="Click to view full photo"
                            aria-label={`View full photo ${entry.name || "Room image"}`}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setLightboxIndex(index);
                              }
                            }}
                          >
                            <img
                              src={entry.preview}
                              alt={entry.name || "Room image"}
                              className="image-preview-card__img"
                              loading="lazy"
                              decoding="async"
                              ref={(node) => {
                                if (node && node.complete) node.classList.add("is-loaded");
                              }}
                              onLoad={(e) => e.currentTarget.classList.add("is-loaded")}
                              onError={(e) => {
                                const fb = getImageFallbackUrl(entry.preview);
                                if (fb && fb !== e.currentTarget.src) {
                                  e.currentTarget.src = fb;
                                }
                              }}
                            />
                            <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-[11px] font-semibold pointer-events-none">
                              <Maximize2 size={13} />
                              <span>Full View</span>
                            </div>
                          </div>
                          <div className="image-preview-card__footer">
                            <span className="image-preview-card__name" title={entry.name}>{entry.name}</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                onClick={() => setLightboxIndex(index)}
                                aria-label={`View full size photo ${entry.name}`}
                                title="View full size photo"
                              >
                                <Maximize2 size={13} />
                              </button>
                              <button
                                type="button"
                                className="image-preview-card__remove"
                                onClick={() => handleRemoveImage(entry.id)}
                                aria-label={`Remove photo ${entry.name}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                      {/* Inline add more */}
                      <label className="rfm-photo-add-more">
                        <ImagePlus size={18} />
                        <span>Add more</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/heic"
                          multiple
                          hidden
                          onChange={handleImageSelection}
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="rfm-photo-dropzone">
                      <ImagePlus size={24} className="rfm-photo-dropzone__main-icon" />
                      <span className="rfm-photo-dropzone__title">Upload room photos</span>
                      <span className="rfm-photo-dropzone__hint">
                        Supported formats: JPEG, PNG, WebP (up to 5 MB per photo)
                      </span>
                      <span className="rfm-photo-dropzone__btn">Choose Photos</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic"
                        multiple
                        hidden
                        onChange={handleImageSelection}
                      />
                    </label>
                  )}
                </div>
              </section>

              {/* ── Card 5: Amenities & House Rules ── */}
              <section className="rfm-card-group">
                <div className="rfm-card-group__header">
                  <div className="rfm-card-group__title-wrap">
                    <span className="rfm-card-group__step-num">5</span>
                    <Tag size={16} className="rfm-card-group__icon" />
                    <h3>Amenities &amp; House Rules</h3>
                  </div>
                  <span className="rfm-card-group__hint">Inclusions and tenant policies</span>
                </div>

                <div className="rfm-card-group__body rfm-card-group__body--stacked">
                  {/* Amenities Sub-block */}
                  <div className="rfm-tag-subgroup">
                    <div className="rfm-tag-subgroup__title">
                      <Tag size={13} />
                      <span>Room Inclusions &amp; Amenities</span>
                    </div>

                    {/* Selected Amenities Chips */}
                    <div className="amenities-tag-container">
                      {form.amenities.length > 0 ? (
                        form.amenities.map((amenity, idx) => (
                          <span key={`${amenity}-${idx}`} className="amenity-chip">
                            {amenity}
                            <button
                              type="button"
                              className="amenity-chip__remove"
                              onClick={() => handleRemoveAmenity(idx)}
                              aria-label={`Remove amenity ${amenity}`}
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="amenities-empty-hint">
                          No amenities added yet. Click presets below or type custom items.
                        </span>
                      )}
                    </div>

                    {/* Custom Amenity Input */}
                    <div className="amenity-input-row">
                      <input
                        type="text"
                        maxLength={LIMITS.AMENITY_MAX}
                        value={customAmenity}
                        onChange={(e) => setCustomAmenity(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddAmenity(customAmenity);
                          }
                        }}
                        placeholder="Add custom amenity (e.g. Personal Refrigerator)..."
                        className="amenity-custom-input"
                      />
                      <button
                        type="button"
                        className="btn-add-amenity"
                        onClick={() => handleAddAmenity(customAmenity)}
                        disabled={!customAmenity.trim()}
                        title={!customAmenity.trim() ? "Type an amenity name first" : "Add amenity"}
                      >
                        <Plus size={14} /> Add
                      </button>
                    </div>

                    {/* Quick Presets */}
                    <div className="amenities-presets-block">
                      <span className="amenities-presets-label">Popular Presets</span>
                      <div className="amenities-presets-list">
                        {AMENITY_PRESETS.map((preset) => {
                          const isSelected = form.amenities.includes(preset);
                          return (
                            <button
                              key={preset}
                              type="button"
                              className={`amenity-preset-btn ${isSelected ? "amenity-preset-btn--selected" : ""}`}
                              onClick={() => handleToggleAmenityPreset(preset)}
                              aria-pressed={isSelected}
                            >
                              {isSelected ? <Check size={11} /> : <Plus size={11} />}
                              {preset}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="rfm-card-inner-divider" />

                  {/* Policies Sub-block */}
                  <div className="rfm-tag-subgroup">
                    <div className="rfm-tag-subgroup__title">
                      <ShieldCheck size={13} />
                      <span>Policies &amp; House Rules</span>
                    </div>

                    {/* Selected Policies Chips */}
                    <div className="amenities-tag-container">
                      {form.policies.length > 0 ? (
                        form.policies.map((policy, idx) => (
                          <span key={`${policy}-${idx}`} className="amenity-chip">
                            {policy}
                            <button
                              type="button"
                              className="amenity-chip__remove"
                              onClick={() => handleRemovePolicy(idx)}
                              aria-label={`Remove rule ${policy}`}
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="amenities-empty-hint">
                          No house rules specified. Click presets below or type custom rules.
                        </span>
                      )}
                    </div>

                    {/* Custom Policy Input */}
                    <div className="amenity-input-row">
                      <input
                        type="text"
                        maxLength={LIMITS.POLICY_MAX}
                        value={customPolicy}
                        onChange={(e) => setCustomPolicy(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddPolicy(customPolicy);
                          }
                        }}
                        placeholder="Add custom rule (e.g. No Cooking in Room)..."
                        className="amenity-custom-input"
                      />
                      <button
                        type="button"
                        className="btn-add-amenity"
                        onClick={() => handleAddPolicy(customPolicy)}
                        disabled={!customPolicy.trim()}
                        title={!customPolicy.trim() ? "Type a policy name first" : "Add policy"}
                      >
                        <Plus size={14} /> Add
                      </button>
                    </div>

                    {/* Quick Presets */}
                    <div className="amenities-presets-block">
                      <span className="amenities-presets-label">Common Presets</span>
                      <div className="amenities-presets-list">
                        {POLICY_PRESETS.map((preset) => {
                          const isSelected = form.policies.includes(preset);
                          return (
                            <button
                              key={preset}
                              type="button"
                              className={`amenity-preset-btn ${isSelected ? "amenity-preset-btn--selected" : ""}`}
                              onClick={() => handleTogglePolicyPreset(preset)}
                              aria-pressed={isSelected}
                            >
                              {isSelected ? <Check size={11} /> : <Plus size={11} />}
                              {preset}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Card 6: Room Description & Bed Setup ── */}
              <section className="rfm-card-group">
                <div className="rfm-card-group__header">
                  <div className="rfm-card-group__title-wrap">
                    <span className="rfm-card-group__step-num">6</span>
                    <FileText size={16} className="rfm-card-group__icon" />
                    <h3>Room Description &amp; Bed Setup</h3>
                  </div>
                  <span className="rfm-card-group__hint">Overview and bed configuration info</span>
                </div>

                <div className="rfm-card-group__body">
                  <div className={`room-form-group ${errors.description ? "has-error" : ""}`}>
                    <div className="rfm-field-header">
                      <label htmlFor="rfm-desc">Description (Optional)</label>
                      <span className="rfm-char-counter">{form.description.length}/{LIMITS.DESCRIPTION_MAX}</span>
                    </div>
                    <textarea
                      id="rfm-desc"
                      rows={2}
                      maxLength={LIMITS.DESCRIPTION_MAX}
                      value={form.description}
                      onChange={(e) => handleChange("description", e.target.value)}
                      placeholder="Brief description of this room for applicants..."
                    />
                    {errors.description && (
                      <span className="field-error" role="alert">
                        <AlertCircle size={12} className="shrink-0" />
                        {errors.description}
                      </span>
                    )}
                  </div>

                  {/* Beds auto-generate notice — create mode only */}
                  {!isEdit && (
                    <div className="rfm-beds-notice">
                      <Layers size={15} />
                      <span>
                        Beds will be auto-generated based on room type and capacity. You can adjust individual bed settings anytime after creation.
                      </span>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* ── Friendly Sticky Footer ── */}
            <div className="admin-modal-footer rfm-friendly-footer">
              <div className="rfm-friendly-footer__status">
                {isFormValid ? (
                  <span className="rfm-footer-status-tag rfm-footer-status-tag--valid">
                    <CheckCircle2 size={13} />
                    All required fields ready
                  </span>
                ) : (
                  <span className="rfm-footer-status-tag rfm-footer-status-tag--incomplete">
                    <AlertCircle size={13} />
                    Complete required fields
                  </span>
                )}
              </div>

              <div className="rfm-friendly-footer__actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleAttemptClose}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rfm-btn-create"
                  disabled={saving || !isFormValid}
                  title={
                    saving
                      ? "Saving room details..."
                      : !isFormValid
                      ? "Please provide a valid Room Name (min 2 chars), Room Number, Room Type, and Floor (1–100)"
                      : isEdit
                      ? "Save Changes"
                      : "Create Room"
                  }
                >
                  {saving ? (
                    <>
                      <LoaderCircle size={15} className="admin-announcements-spin" />
                      {isEdit ? "Saving..." : "Creating..."}
                    </>
                  ) : isEdit ? (
                    "Save Changes"
                  ) : (
                    "Create Room"
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* ── Unsaved Changes Confirmation Modal ── */}
      {showConfirmClose && (
        <div className="confirm-discard-overlay" onClick={() => setShowConfirmClose(false)} role="dialog" aria-modal="true">
          <div className="confirm-discard-card" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-discard-header">
              <ShieldAlert size={20} className="confirm-discard-icon" />
              <h3>Discard Unsaved Changes?</h3>
            </div>
            <p>
              You have unsaved modifications for this room. If you close now, all your typed details and uploaded photos will be discarded.
            </p>
            <div className="confirm-discard-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowConfirmClose(false)}
              >
                Keep Editing
              </button>
              <button
                type="button"
                className="btn-danger confirm-discard-danger-btn"
                onClick={() => {
                  setShowConfirmClose(false);
                  onClose();
                }}
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {lightboxIndex !== null && (
        <RoomImageLightboxModal
          images={form.images}
          initialIndex={lightboxIndex}
          roomNumber={form.roomNumber || form.name || "New Room"}
          roomType={form.type}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>,
    document.body
  );
}