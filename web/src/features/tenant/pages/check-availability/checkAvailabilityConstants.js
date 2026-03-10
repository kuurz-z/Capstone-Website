import standardRoom from "../../../../assets/images/branches/gil-puyat/standard-room.jpg";
import deluxeRoom from "../../../../assets/images/branches/gil-puyat/deluxe-room.jpg";
import premiumRoom from "../../../../assets/images/branches/gil-puyat/premium-room.jpg";
import gallery1 from "../../../../assets/images/branches/gil-puyat/gallery1.jpg";

export const AVAILABLE_APPLIANCES = [
  { id: "fan", name: "Electric Fan", price: 200 },
  { id: "ricecooker", name: "Rice Cooker", price: 200 },
  { id: "laptop", name: "Laptop", price: 200 },
];

export const BRANCH_CAPACITY = {
  "Gil Puyat": {
    totalRooms: 20,
    totalBeds: 60,
    roomTypes: {
      Private: { maxRooms: 5, bedsPerRoom: 2 },
      Shared: { maxRooms: 8, bedsPerRoom: 2 },
      Quadruple: { maxRooms: 7, bedsPerRoom: 4 },
    },
  },
  Guadalupe: {
    totalRooms: 12,
    totalBeds: 48,
    roomTypes: { Quadruple: { maxRooms: 12, bedsPerRoom: 4 } },
  },
};

export const UPCOMING_ROOM = {
  id: "GD-Q-004",
  title: "Room GD-Q-004",
  branch: "Guadalupe",
  type: "Quadruple",
  price: 4200,
  availableFrom: "March 15, 2026",
};

export const validateRoomCapacity = (rooms) => {
  const validation = { isValid: true, errors: [], warnings: [] };
  Object.keys(BRANCH_CAPACITY).forEach((branch) => {
    const branchRooms = rooms.filter((r) => r.branch === branch);
    const config = BRANCH_CAPACITY[branch];
    if (branchRooms.length > config.totalRooms) {
      validation.errors.push(
        `${branch}: Room count exceeds maximum of ${config.totalRooms}`,
      );
      validation.isValid = false;
    }
    const totalBeds = branchRooms.reduce(
      (sum, room) => sum + (room.beds ? room.beds.length : 0),
      0,
    );
    if (totalBeds > config.totalBeds) {
      validation.errors.push(
        `${branch}: Bed count ${totalBeds} exceeds maximum of ${config.totalBeds}`,
      );
      validation.isValid = false;
    }
    Object.keys(config.roomTypes).forEach((roomType) => {
      const typeRooms = branchRooms.filter((r) => r.type === roomType);
      const rc = config.roomTypes[roomType];
      if (typeRooms.length > rc.maxRooms)
        validation.warnings.push(
          `${branch} - ${roomType}: Count ${typeRooms.length} exceeds recommended ${rc.maxRooms}`,
        );
      typeRooms.forEach((room) => {
        const bc = room.beds ? room.beds.length : 0;
        if (bc !== rc.bedsPerRoom)
          validation.warnings.push(
            `${room.title}: Has ${bc} beds, expected ${rc.bedsPerRoom}`,
          );
      });
    });
  });
  return validation;
};

export const checkRoomOverbooking = (room) => {
  if (!room.beds) return false;
  return room.beds.filter((bed) => !bed.available).length > room.beds.length;
};

export const mapRoomType = (type) => {
  const v = typeof type === "string" ? type.toLowerCase() : "";
  if (v === "private") return "Private";
  if (v === "double-sharing") return "Shared";
  if (v === "quadruple-sharing") return "Quadruple";
  return "Unknown";
};

export const mapBranchLabel = (branch) => {
  if (branch === "gil-puyat") return "Gil Puyat";
  if (branch === "guadalupe") return "Guadalupe";
  return "Unknown";
};

export const getPrimaryImage = (type) => {
  if (type === "private") return standardRoom;
  if (type === "double-sharing") return premiumRoom;
  return gallery1;
};

export const ROOM_IMAGES = { standardRoom, deluxeRoom, premiumRoom, gallery1 };

export const buildBedsFromCapacity = (roomNumber, type, occupiedCount = 0) => {
  const positions =
    type === "private"
      ? ["single", "single"]
      : type === "double-sharing"
        ? ["upper", "lower"]
        : ["upper", "lower", "upper", "lower"];
  return positions.map((position, index) => ({
    id: `${roomNumber}-B${index + 1}`,
    position,
    available: index >= occupiedCount,
  }));
};
