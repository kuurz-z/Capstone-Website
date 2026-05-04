export function getRoomLabel(room, fallback = "Unknown room") {
  if (!room) return fallback;

  return room.name || room.roomNumber || room.room_number || room.room_id || room.id || fallback;
}
