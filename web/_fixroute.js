const fs = require('fs');
const f = 'd:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/server/routes/electricityRoutes.js';
let c = fs.readFileSync(f, 'utf8');
const NL = c.includes('\r\n') ? '\r\n' : '\n';

// Fix: the broken comment block around lines 76-87
const broken =
  '/**' + NL +
  NL +
  '/**' + NL +
  ' * PATCH /api/electricity/readings/:id' + NL +
  ' * Update an existing meter reading (value, date, eventType, tenantId)' + NL +
  ' */' + NL +
  'router.patch("/readings/:id", verifyAdmin, filterByBranch, electricityController.updateMeterReading);' + NL +
  NL +
  ' * DELETE /api/electricity/readings/:id' + NL +
  ' * Soft-delete a meter reading (blocks if attached to a closed period)' + NL +
  ' */' + NL +
  'router.delete("/readings/:id", verifyAdmin, filterByBranch, electricityController.deleteMeterReading);';

const fixed =
  '/**' + NL +
  ' * PATCH /api/electricity/readings/:id' + NL +
  ' * Update an existing meter reading (value, date, eventType, tenantId)' + NL +
  ' */' + NL +
  'router.patch("/readings/:id", verifyAdmin, filterByBranch, electricityController.updateMeterReading);' + NL +
  NL +
  '/**' + NL +
  ' * DELETE /api/electricity/readings/:id' + NL +
  ' * Soft-delete a meter reading (blocks if attached to a closed period)' + NL +
  ' */' + NL +
  'router.delete("/readings/:id", verifyAdmin, filterByBranch, electricityController.deleteMeterReading);';

if (c.includes(broken)) {
  c = c.replace(broken, fixed);
  console.log('Fixed!');
} else {
  console.log('Broken pattern not found, trying line-by-line...');
  // Just find and fix the stray "/**\r\n\r\n/**" pattern
  c = c.replace('/**' + NL + NL + '/**', '/**');
  // And add the missing "/**" before DELETE comment
  c = c.replace(NL + ' * DELETE /api/electricity', NL + '/**' + NL + ' * DELETE /api/electricity');
  console.log('Fixed with fallback');
}

fs.writeFileSync(f, c, 'utf8');
console.log('DONE');
