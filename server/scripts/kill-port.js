/**
 * =============================================================================
 * PORT KILLER UTILITY
 * =============================================================================
 *
 * This script kills any process using port 5000 (or specified port).
 * Useful when server crashes and leaves a zombie process.
 *
 * Usage:
 *   node kill-port.js          (kills process on port 5000)
 *   node kill-port.js 3000     (kills process on specified port)
 */

import { exec } from "child_process";

const port = process.argv[2] || 5000;

console.log(`🔍 Searching for process on port ${port}...`);

// Windows command to find and kill process
const command =
  process.platform === "win32"
    ? `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port}') do taskkill /F /PID %a`
    : `lsof -ti:${port} | xargs kill -9`;

exec(command, (error, stdout, stderr) => {
  if (error) {
    if (stderr.includes("not found") || stderr.includes("No such process")) {
      console.log(`✅ No process found on port ${port}`);
    } else {
      console.log(`ℹ️ Port ${port} is not in use or already freed`);
    }
  } else {
    console.log(`✅ Successfully killed process on port ${port}`);
  }
});
