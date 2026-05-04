import mongoose from "mongoose";
import User from "./models/User.js";

async function checkUsers() {
  try {
    await mongoose.connect("mongodb://localhost:27017/lilycrest-dormitory");
    const users = await User.find({});
    console.log("Users in database:");
    users.forEach((u) => console.log(`${u.email}: ${u.role}`));
    await mongoose.disconnect();
  } catch (err) {
    console.error("Error:", err);
  }
}

checkUsers();
