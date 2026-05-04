import mongoose from "mongoose";
import dotenv from "dotenv";
import { Room } from "../models/index.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/lilycrest-dormitory";

const PRICING = {
  "private":           { price: 14400, monthlyPrice: 13500, capacity: 1, beds: ["upper", "lower"] }, 
  "double-sharing":    { price:  8000, monthlyPrice:  7200, capacity: 2, beds: ["upper", "lower"] }, 
  "quadruple-sharing": { price:  6300, monthlyPrice:  5400, capacity: 4, beds: ["upper", "lower", "upper", "lower"] }, 
};

const baseAmenities = ["Air Conditioning", "WiFi", "Double Decker Bed", "Mattress", "Table", "Chair", "Cabinet", "Shower Water Heater"];

const generateRooms = () => {
  const plans = [
    // GUADALUPE
    ...Array.from({ length: 7 }, (_, i) => ({ branch: "guadalupe", floor: 1, roomNumber: `10${i+1}`, type: "quadruple-sharing" })),
    ...Array.from({ length: 9 }, (_, i) => ({ branch: "guadalupe", floor: 2, roomNumber: `20${i+1}`, type: "quadruple-sharing" })),
    
    // GIL-PUYAT
    ...Array.from({ length: 3 }, (_, i) => ({ branch: "gil-puyat", floor: 2, roomNumber: `20${i+1}`, type: "quadruple-sharing" })),
    ...Array.from({ length: 2 }, (_, i) => ({ branch: "gil-puyat", floor: 2, roomNumber: `20${i+4}`, type: "quadruple-sharing" })),
    
    ...Array.from({ length: 10 }, (_, i) => ({ branch: "gil-puyat", floor: 3, roomNumber: `3${(i+1).toString().padStart(2, '0')}`, type: "quadruple-sharing" })),
    ...Array.from({ length: 10 }, (_, i) => ({ branch: "gil-puyat", floor: 4, roomNumber: `4${(i+1).toString().padStart(2, '0')}`, type: "quadruple-sharing" })),
    
    ...Array.from({ length: 9 }, (_, i) => ({ branch: "gil-puyat", floor: 5, roomNumber: `50${i+1}`, type: "quadruple-sharing" })),
    { branch: "gil-puyat", floor: 5, roomNumber: "510", type: "double-sharing" },
    
    ...Array.from({ length: 8 }, (_, i) => ({ branch: "gil-puyat", floor: 6, roomNumber: `60${i+1}`, type: "quadruple-sharing" })),
    ...Array.from({ length: 2 }, (_, i) => ({ branch: "gil-puyat", floor: 6, roomNumber: `60${i+9}`, type: "double-sharing" })),
    
    ...Array.from({ length: 3 }, (_, i) => ({ branch: "gil-puyat", floor: 7, roomNumber: `70${i+1}`, type: "double-sharing" })),
    ...Array.from({ length: 10 }, (_, i) => ({ branch: "gil-puyat", floor: 7, roomNumber: `7${(i+4).toString().padStart(2, '0')}`, type: "private" })),
    
    { branch: "gil-puyat", floor: 8, roomNumber: "801", type: "double-sharing" },
    ...Array.from({ length: 12 }, (_, i) => ({ branch: "gil-puyat", floor: 8, roomNumber: `8${(i+2).toString().padStart(2, '0')}`, type: "private" })),
  
    ...Array.from({ length: 13 }, (_, i) => ({ branch: "gil-puyat", floor: 9, roomNumber: `9${(i+1).toString().padStart(2, '0')}`, type: "private" })),
  
    ...Array.from({ length: 13 }, (_, i) => ({ branch: "gil-puyat", floor: 10, roomNumber: `10${(i+1).toString().padStart(2, '0')}`, type: "private" })),
  ];
  return plans;
}

const runSeeder = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to DB.");

    const roomsToSeed = generateRooms();
    let created = 0;
    let skipped = 0;

    for (const data of roomsToSeed) {
      const prefix = data.branch === "gil-puyat" ? "GP" : "GD";
      const prefixedNumber = `${prefix}-${data.roomNumber}`;
      
      const exists = await Room.findOne({ roomNumber: prefixedNumber });
      if (exists) {
        skipped++;
        continue;
      }
      
      const config = PRICING[data.type];
      const beds = config.beds.map((pos, idx) => ({
        id: `bed-${idx+1}`,
        position: pos,
        status: "available"
      }));

      const desc = ["713", "813", "913", "1013"].includes(data.roomNumber) && data.branch === "gil-puyat" 
        ? "Private Premium" 
        : "";

      const newRoom = new Room({
        name: `${prefix} - Room ${data.roomNumber}`,
        roomNumber: prefixedNumber,
        branch: data.branch,
        type: data.type,
        floor: data.floor,
        capacity: config.capacity,
        price: config.price,
        monthlyPrice: config.monthlyPrice,
        description: desc,
        amenities: baseAmenities,
        beds: beds,
        policies: ["No Smoking inside the room.", "Keep noise to a minimum after 10PM.", "No pets allowed."],
        images: []
      });

      await newRoom.save();
      created++;
      console.log(`CREATED: ${newRoom.branch} - ${newRoom.roomNumber} (${newRoom.type})`);
    }

    console.log(`\nDONE! Created: ${created}, Skipped: ${skipped}, Total rooms processed: ${roomsToSeed.length}`);
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
};

runSeeder();
