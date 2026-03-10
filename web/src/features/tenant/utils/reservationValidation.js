// Validation utilities for reservation form

export const validateFullName = (name) => {
  if (!name) return { valid: false, error: "Name is required" };
  if (name.length > 64)
    return { valid: false, error: "Name must be 64 characters or less" };
  if (/\d/.test(name))
    return { valid: false, error: "Name cannot contain numbers" };
  return { valid: true };
};

export const validateNameField = (name) => {
  if (!name) return { valid: false, error: "This field is required" };
  if (name.length > 32)
    return { valid: false, error: "Must be 32 characters or less" };
  if (/\d/.test(name)) return { valid: false, error: "Cannot contain numbers" };
  return { valid: true };
};

export const validatePhoneNumber = (phone) => {
  if (!phone) return { valid: false, error: "Phone number is required" };
  // Must start with +63
  if (!phone.startsWith("+63"))
    return { valid: false, error: "Phone number must start with +63" };
  // Remove +63 and check if rest are digits only
  const remainder = phone.substring(3);
  if (!/^\d+$/.test(remainder))
    return {
      valid: false,
      error: "Phone number can only contain digits after +63",
    };
  if (phone.length < 12)
    return {
      valid: false,
      error: "Phone number must be at least 12 characters",
    };
  if (phone.length > 15)
    return { valid: false, error: "Phone number is too long" };
  return { valid: true };
};

export const validateBirthday = (birthday) => {
  if (!birthday) return { valid: false, error: "Birthday is required" };
  const birthDate = new Date(birthday);
  const today = new Date();
  const currentYear = today.getFullYear();
  const birthYear = birthDate.getFullYear();

  if (birthYear >= currentYear) {
    return {
      valid: false,
      error: "Birthday cannot be in the current year or future",
    };
  }

  // Check if person is at least 18 years old
  let age = currentYear - birthYear;
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  if (age < 18) {
    return { valid: false, error: "Must be at least 18 years old" };
  }

  return { valid: true };
};

export const validateAddress = (address) => {
  if (!address) return { valid: false, error: "This field is required" };
  if (address.length > 100)
    return { valid: false, error: "Must be 100 characters or less" };
  return { valid: true };
};

export const validateUnitHouseNo = (unitNo) => {
  if (!unitNo) return { valid: false, error: "Unit/House number is required" };
  if (unitNo.length > 64)
    return { valid: false, error: "Must be 64 characters or less" };
  return { valid: true };
};

export const validateAddressField = (address) => {
  if (!address) return { valid: false, error: "This field is required" };
  if (address.length > 32)
    return { valid: false, error: "Must be 32 characters or less" };
  return { valid: true };
};

export const validateTargetMoveInDate = (date) => {
  if (!date) return { valid: false, error: "This field is required" };

  const selectedDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Date must be in the future
  if (selectedDate <= today) {
    return { valid: false, error: "Date must be in the future" };
  }

  // Must be within 3 months
  const threeMonthsLater = new Date();
  threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

  if (selectedDate > threeMonthsLater) {
    return {
      valid: false,
      error: "Target move-in date must be within 3 months",
    };
  }

  return { valid: true };
};

export const validateEstimatedTime = (time) => {
  if (!time) return { valid: false, error: "This field is required" };

  try {
    const parts = time.split(":");
    if (parts.length !== 2) {
      return { valid: false, error: "Invalid time format" };
    }

    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);

    if (isNaN(hours) || isNaN(minutes)) {
      return { valid: false, error: "Invalid time format" };
    }

    // Must be between 8am (08:00) and 6pm (18:00)
    const timeInMinutes = hours * 60 + minutes;
    const eightAm = 8 * 60; // 480
    const sixPm = 18 * 60; // 1080

    if (timeInMinutes < eightAm || timeInMinutes > sixPm) {
      return {
        valid: false,
        error: "Time must be between 8:00 AM and 6:00 PM",
      };
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: "Invalid time format" };
  }
};

export const validateGeneralTextField = (text, maxLength = 100) => {
  if (text && text.length > maxLength) {
    return { valid: false, error: `Must be ${maxLength} characters or less` };
  }
  return { valid: true };
};
