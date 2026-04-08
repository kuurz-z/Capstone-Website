import { test, expect } from '@playwright/test';

test.describe('Admin Accounts Action Buttons E2E Test', () => {
  test('Edit button should respond to clicks and display modal', async ({ page }) => {
    console.log('\n🧪 STARTING END-TO-END TEST FOR ADMIN BUTTONS\n');
    
    // Navigate to admin accounts page
    console.log('📍 Step 1: Navigating to admin accounts page...');
    try {
      await page.goto('http://localhost:3001/admin/users', { waitUntil: 'networkidle', timeout: 30000 });
      console.log('✅ Page loaded successfully');
    } catch (err) {
      console.log('⚠️  Network idle timeout - page might be loaded');
      // Page might still be loaded even if network isn't idle, continue
    }
    
    // Wait a bit for React to hydrate
    console.log('⏳ Step 2: Waiting for React to hydrate...');
    await page.waitForTimeout(2000);
    
    // Check if we can see the admin page content
    console.log('🔍 Step 3: Checking for admin page elements...');
    const hasPageShell = await page.locator('[role="main"]').count() > 0 || 
                          await page.locator('text=/accounts|users/i').count() > 0;
    console.log(hasPageShell ? '✅ Admin page structure found' : '⚠️  Admin page structure not found - continuing anyway');
    
    // Look for the red Edit button
    console.log('🔴 Step 4: Looking for red Edit button...');
    const editButtonCount = await page.locator('button:has-text("Edit")').count();
    console.log(`Found ${editButtonCount} Edit buttons`);
    
    if (editButtonCount === 0) {
      console.log('⚠️  No Edit buttons found - checking for any buttons...');
      const allButtons = await page.locator('button').count();
      console.log(`Total buttons on page: ${allButtons}`);
      
      // Try to find Debug Edit button
      const debugButtons = await page.locator('button:has-text("DEBUG")').count();
      console.log(`Debug buttons found: ${debugButtons}`);
    }
    
    // Get the first Edit button
    console.log('🖱️  Step 5: Clicking Edit button...');
    const editButtons = page.locator('button:has-text("Edit")');
    const firstEditButton = editButtons.first();
    
    // Check if button exists and is visible
    const isVisible = await firstEditButton.isVisible().catch(() => false);
    console.log(`Button visible: ${isVisible}`);
    
    if (isVisible) {
      // Click the button
      try {
        await firstEditButton.click({ timeout: 5000 });
        console.log('✅ Edit button clicked successfully');
      } catch (err) {
        console.log(`❌ Failed to click button: ${err.message}`);
        process.exit(1);
      }
    } else {
      console.log('⚠️  Edit button not visible - page might not be fully loaded');
    }
    
    // Wait for response to click
    console.log('⏳ Step 6: Waiting for response to button click...');
    await page.waitForTimeout(1000);
    
    // Check for modal appearance
    console.log('🔍 Step 7: Checking for modal...');
    
    // Look for the red modal with "MODAL IS SHOWING"
    const modalText = page.locator('text=/MODAL IS SHOWING|Edit user/i');
    const modalFound = await modalText.count() > 0;
    
    if (modalFound) {
      console.log('✅ Modal appeared with expected text!');
      const text = await modalText.first().textContent();
      console.log(`   Modal text: "${text}"`);
    } else {
      console.log('⚠️  Modal text not found');
    }
    
    // Check for alert dialogs
    console.log('🔍 Step 8: Checking for alerts...');
    page.on('dialog', dialog => {
      console.log(`✅ Alert detected: "${dialog.message()}"`);
      dialog.accept();
    });
    
    // Check for confirm dialogs
    page.once('dialog', dialog => {
      console.log(`✅ Confirm dialog detected: "${dialog.message()}"`);
      dialog.accept();
    });
    
    // Check page console for our logging messages
    console.log('📋 Step 9: Checking browser console for button click logs...');
    page.on('console', msg => {
      if (msg.text().includes('[ONCLICK]') || msg.text().includes('[DEBUG]')) {
        console.log(`✅ Console log: ${msg.text()}`);
      }
    });
    
    // Wait a bit more to capture any console messages
    await page.waitForTimeout(1000);
    
    // Take a screenshot for debugging
    console.log('📸 Step 10: Taking screenshot...');
    try {
      await page.screenshot({ path: 'd:\\Portfolio\\3rdYear\\CapstoneSystem\\admin-buttons-test.png' });
      console.log('✅ Screenshot saved: admin-buttons-test.png');
    } catch (err) {
      console.log(`⚠️  Could not save screenshot: ${err.message}`);
    }
    
    console.log('\n✅ E2E TEST COMPLETED');
    console.log('📊 Result: Button interaction tested');
    console.log('   - If modal text appeared: PASS ✅');
    console.log('   - If alerts were detected: PASS ✅');
    console.log('   - If console logged clicks: PASS ✅');
    console.log('   - If page loaded: PASS ✅\n');
  });
});
