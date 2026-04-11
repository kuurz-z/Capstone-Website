# Room, Bed & Occupancy Management System

## Overview

The Room, Bed & Occupancy Management module tracks and manages room capacity, bed assignments, and occupancy rates across all dormitory branches. It provides real-time occupancy data and automatically manages room availability based on confirmed reservations.

## Key Features

### 1. Room Configuration

- **Capacity Management**: Each room has a defined capacity (1 for private, 2 for double-sharing, 4 for quadruple-sharing)
- **Bed Tracking**: Individual bed management with position tracking (upper, lower, single)
- **Availability Flags**: Automatic availability calculation based on current occupancy
- **Branch Assignment**: Rooms assigned to specific branches (Gil Puyat, Guadalupe)

### 2. Bed Management

Each bed in a room has the following structure:

```javascript
{
  id: String,                  // Unique bed identifier
  position: String,            // "upper", "lower", or "single"
  available: Boolean,          // Availability status
  occupiedBy: {
    userId: ObjectId,          // User occupying the bed
    reservationId: ObjectId,   // Associated reservation
    occupiedSince: Date        // When the bed was occupied
  }
}
```

### 3. Occupancy Tracking

- **Automatic Updates**: Occupancy automatically updates when reservation status changes
- **Status-Based Occupancy**:
  - `pending` → No occupancy impact
  - `reserved` → Room marked as occupied (+1 to currentOccupancy)
  - `moveIn` → Room remains occupied (no additional change)
  - `cancelled` → Occupancy released (-1 to currentOccupancy)
  - `moveOut` → Occupancy released (-1 to currentOccupancy)

## Data Models

### Room Model Enhancements

```javascript
{
  capacity: Number,                    // Max occupants
  currentOccupancy: Number,            // Current number of occupants
  available: Boolean,                  // Availability status
  beds: [{                             // Individual bed tracking
    id: String,
    position: String,
    available: Boolean,
    occupiedBy: {
      userId: ObjectId,
      reservationId: ObjectId,
      occupiedSince: Date
    }
  }],
  // Virtual fields
  isFull: Boolean,                     // currentOccupancy >= capacity
  availableSlots: Number               // capacity - currentOccupancy
}
```

### Room Methods

- `occupyBed(bedId, userId, reservationId)` - Mark a bed as occupied
- `vacateBed(bedId)` - Mark a bed as vacant
- `getAvailableBeds()` - Get list of unoccupied beds
- `getOccupiedBeds()` - Get list of occupied beds
- `isBedAvailable(bedId)` - Check if specific bed is available
- `increaseOccupancy()` - Increment current occupancy
- `decreaseOccupancy()` - Decrement current occupancy
- `updateAvailability()` - Recalculate room availability

### Reservation Model Enhancements

New methods for occupancy tracking:

- `countsTowardOccupancy()` - Check if reservation affects room capacity
- `getOccupancyStatus()` - Get occupancy information

### BedHistory Model

**File:** `models/BedHistory.js`

Tracks all bed assignment changes for audit and historical analysis:

```javascript
{
  roomId: ObjectId,          // Room reference
  bedId: String,             // Bed identifier
  userId: ObjectId,          // Tenant assigned/removed
  reservationId: ObjectId,   // Associated reservation
  action: String,            // "assigned" or "vacated"
  timestamp: Date            // When the change occurred
}
```

---

## API Endpoints

### 1. Get Room Occupancy Status

```
GET /api/reservations/occupancy/:roomId
```

**Response:**

```json
{
  "roomName": "GP-Q-002",
  "roomType": "quadruple-sharing",
  "capacity": 4,
  "currentOccupancy": 2,
  "occupancyRate": "50%",
  "isAvailable": true,
  "totalBeds": 4,
  "occupiedBeds": [
    {
      "bedId": "bed-upper-1",
      "position": "upper",
      "occupiedBy": {
        "userId": "user123",
        "userName": "John Doe",
        "email": "john@example.com",
        "occupiedSince": "2026-01-15T10:30:00Z"
      }
    }
  ],
  "availableBeds": [
    {
      "bedId": "bed-lower-1",
      "position": "lower"
    }
  ]
}
```

### 2. Get Branch Occupancy Statistics

```
GET /api/reservations/stats/occupancy?branch=gil-puyat
```

**Response:**

```json
{
  "branch": "gil-puyat",
  "totalRooms": 20,
  "totalCapacity": 50,
  "totalOccupancy": 38,
  "overallOccupancyRate": "76%",
  "rooms": [
    {
      "roomName": "GP-P-001",
      "roomType": "private",
      "capacity": 1,
      "currentOccupancy": 1,
      "occupancyRate": "100%",
      "isAvailable": false,
      "occupiedBeds": [...],
      "availableBeds": [...]
    }
  ]
}
```

## Occupancy Manager Utility

### Core Functions

#### `updateOccupancyOnReservationChange(reservation, oldData)`

Handles occupancy updates when reservation status changes.

- **Increases Occupancy**: When status becomes "reserved" or "moveIn"
- **Decreases Occupancy**: When status becomes "cancelled" or "moveOut"
- **Bed Management**: Assigns/vacates beds based on selectedBed
- **Room Availability**: Automatically recalculates room availability

#### `recalculateRoomOccupancy(roomId)`

Recalculates occupancy from scratch by counting reserved/moved-in reservations.
**Use Case**: Data recovery, consistency checks

#### `getRoomOccupancyStatus(roomId)`

Provides detailed occupancy information for a specific room including:

- Occupancy rate percentage
- List of occupied beds with resident info
- List of available beds
- Current vs. maximum capacity

#### `getBranchOccupancyStats(branch)`

Provides comprehensive occupancy statistics for entire branch.
**Optional Parameter**: `branch` - Leave empty for all branches

## Workflow Examples

### Example 1: New Reservation Confirmed

```
User creates reservation (status: pending)
  ↓
Admin verifies payment & confirms (status: confirmed)
  ↓
updateOccupancyOnReservationChange triggered
  ↓
Room occupancy increases by 1
  ↓
Bed marked as occupied
  ↓
Room availability recalculated
```

### Example 2: Tenant Move-In

```
Tenant performs move-in (status: moveIn)
  ↓
updateOccupancyOnReservationChange triggered
  ↓
No occupancy change (already counted from confirmation)
  ↓
User role updated to "tenant"
  ↓
tenantStatus set to "active"
```

### Example 3: Reservation Cancellation

```
User or admin cancels reservation
  ↓
updateOccupancyOnReservationChange triggered
  ↓
Room occupancy decreases by 1
  ↓
Bed marked as available
  ↓
Room availability updated to available again
```

## Database Indexes

The following indexes are configured for optimal occupancy queries:

- `roomId, checkInDate` - For finding reservations by room and date
- `status, checkInDate` - For finding reservations by status and date
- `userId, status` - For finding user's reservations by status

## Business Rules

### Occupancy Counting Rules

1. **Only Reserved & Moved-In Count**: Only reservations with status "reserved" or "moveIn" count toward room occupancy
2. **Archived Don't Count**: Archived reservations never count toward occupancy
3. **Automatic Availability**: `available` flag automatically set to `true` when occupancy < capacity
4. **Full Room Status**: `isFull` virtual indicates when room reaches capacity

### Bed Assignment Rules

1. **One Occupant Per Bed**: Each bed can only be occupied by one reservation
2. **Tracked from Confirmation**: Beds are assigned when reservation status becomes "confirmed"
3. **Automatic Vacancy**: Beds automatically released when reservation is cancelled or moved out
4. **Optional Selection**: selectedBed is optional - rooms without beds assigned for quarantine rooms

## Error Handling

The system includes graceful error handling:

- **Non-Fatal Occupancy Failures**: Occupancy update failures don't block reservation updates (logged as warnings)
- **Atomic Operations**: Each occupancy change is saved together with room data
- **Validation**: Input validation on room IDs and branch filters

## Monitoring & Maintenance

### Recalculation Utility

If occupancy data becomes inconsistent, use:

```javascript
import { recalculateRoomOccupancy } from "./utils/occupancyManager.js";

// Recalculate single room
await recalculateRoomOccupancy(roomId);

// Or check entire branch stats
import { getBranchOccupancyStats } from "./utils/occupancyManager.js";
const stats = await getBranchOccupancyStats("gil-puyat");
```

### Bed Lock Cleanup

**File:** `utils/bedLockCleanup.js`

A scheduled job that automatically releases expired bed locks from abandoned reservations. When a tenant begins a reservation flow but never completes it, the system temporarily locks the selected bed. This cleanup job periodically scans for stale locks and releases them so the beds become available again.

Run frequency: **Every 10 minutes** (via `utils/scheduler.js`)

### Scheduled Jobs

The occupancy system integrates with the cron scheduler for automated maintenance:

| Job              | Frequency  | Purpose                                         |
| ---------------- | ---------- | ----------------------------------------------- |
| Bed Lock Cleanup | Every 10m  | Release expired temporary bed locks             |
| Grace Period     | Every 5m   | Auto-expire unpaid reservations past grace      |

### Logging

All occupancy changes are logged with:

- Room name and ID
- Occupancy change (increase/decrease)
- Bed assignments/vacancies
- Previous and new occupancy counts
- Bed history records via `BedHistory` model

## Integration with Existing Modules

### Reservation Management

- `updateReservation()`: Triggers occupancy on status change
- `deleteReservation()`: Releases occupancy when deleted
- `archiveReservation()`: Cancels reservation first to release occupancy

### User Management

- Tenant status automatically activated on move-in
- Role updated to "tenant" when moved in

### Room Management

- Room availability automatically recalculated
- Used in availability checking for room selection

## Vacancy Date Forecasting

The system now includes vacancy date forecasting via the `/api/payments/vacancy-dates` endpoint. This computes expected vacancy dates from move-in date + leaseDuration for all moved-in reservations, providing admins with visibility into upcoming room availability.

---

## Future Enhancements

Potential features for future implementation:

1. **Peak Hours Analysis** — Identify peak occupancy periods
2. **Bed Preference Analytics** — Track popular bed positions (data available via `BedHistory`)
3. **Occupancy Notifications** — Alert admins when rooms approach full capacity
4. **Waitlist Management** — Auto-waitlist when room becomes full
