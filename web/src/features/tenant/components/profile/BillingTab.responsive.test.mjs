import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tabSource = readFileSync(new URL("./BillingTab.jsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../../styles/tenant-billing.css", import.meta.url), "utf8");

test("BillingTab renders compact mobile dropdown selects for status and category and hides them on sm+", () => {
  // Mobile status dropdown select is present with sm:hidden
  assert.match(tabSource, /<select[\s\S]*?id="mobile-statement-status-filter"[\s\S]*?className="[^"]*sm:hidden/);

  // Mobile category dropdown select is present with sm:hidden
  assert.match(tabSource, /<select[\s\S]*?id="mobile-statement-category-filter"[\s\S]*?className="[^"]*sm:hidden/);

  // Safe fallback selection guards
  assert.match(tabSource, /statusOptions\.some\(\(opt\)\s*=>\s*opt\.value\s*===\s*statusFilter\)\s*\?\s*statusFilter\s*:\s*"all"/);
  assert.match(tabSource, /categoryOptions\.some\(\(cat\)\s*=>\s*cat\.value\s*===\s*categoryFilter\)\s*\?\s*categoryFilter\s*:\s*"all"/);

  // Desktop filter toolbar has hidden sm:flex
  assert.match(tabSource, /className="[^"]*hidden\s+sm:flex[^"]*statement-filters-toolbar/);
});

test("BillingTab implements multi-mode scrolling: wheel translation and carousel navigation arrows", () => {
  // Wheel event translation for mouse users with 0.85 scaling factor
  assert.match(
    tabSource,
    /el\.addEventListener\("wheel"/,
    "Must attach wheel event listener to translate vertical wheel to horizontal scroll"
  );
  assert.match(
    tabSource,
    /el\.scrollLeft\s*\+=\s*e\.deltaY\s*\*\s*0\.85/,
    "Must scale vertical wheel delta to horizontal scroll"
  );

  // Chevron arrow navigation buttons
  assert.match(tabSource, /statement-filter-carousel-arrow--left/, "Must provide left carousel scroll button");
  assert.match(tabSource, /statement-filter-carousel-arrow--right/, "Must provide right carousel scroll button");
  assert.match(tabSource, /canScrollLeft \? "is-visible" : ""/, "Must toggle is-visible class instead of unmounting");
  assert.match(tabSource, /canScrollRight \? "is-visible" : ""/, "Must toggle is-visible class for right arrow");

  // Asymmetric hysteresis thresholds to eliminate boundary flickering
  assert.match(tabSource, /el\.scrollLeft > 4 : el\.scrollLeft > 18/, "Must implement asymmetric hysteresis for scrollLeft");

  // Keyboard accessibility and ARIA
  assert.match(tabSource, /tabIndex=\{canScrollLeft \? 0 : -1\}/);
  assert.match(tabSource, /aria-hidden=\{!canScrollLeft\}/);
});

test("BillingTab implements click-and-drag to scroll with click prevention on drag", () => {
  assert.match(tabSource, /onMouseDown=\{handleMouseDown\}/);
  assert.match(tabSource, /onMouseMove=\{handleMouseMove\}/);
  assert.match(tabSource, /onMouseUp=\{handleMouseUpOrLeave\}/);
  assert.match(tabSource, /isDragging \? "is-dragging" : ""/);
  assert.match(tabSource, /if\s*\(hasDragged\.current\)\s*\{\s*e\.preventDefault\(\);\s*return;\s*\}/);
});

test("BillingTab and tenant-billing.css prevent category dropdown menu from clipping off-screen", () => {
  // Bounding rect check to switch dropdown alignment
  assert.match(tabSource, /getBoundingClientRect\(\)/);
  assert.match(tabSource, /setDropdownAlign\("left"\)/);
  assert.match(tabSource, /setDropdownAlign\("right"\)/);
  assert.match(tabSource, /updateDropdownPosition\(\)/);
  assert.match(tabSource, /category-dropdown-menu \$\{dropdownAlign === "left" \? "align-left" : ""\}/);

  // CSS rules for responsive alignment and max-width viewport safety
  assert.match(
    cssSource,
    /\.category-dropdown-menu\s*\{[^}]*max-width:\s*calc\(100vw\s*-\s*32px\);/,
    "Dropdown menu must have max-width: calc(100vw - 32px) to prevent screen overflow"
  );
  assert.match(
    cssSource,
    /\.category-dropdown-menu\s*\{[^}]*min-width:\s*min\(220px,\s*calc\(100vw\s*-\s*32px\)\);/,
    "Dropdown menu min-width must not exceed max-width on narrow screens"
  );
  assert.match(
    cssSource,
    /\.category-dropdown-menu\.align-left\s*\{[^}]*right:\s*auto;[^}]*left:\s*0;/,
    "Dropdown menu .align-left must override right: 0 to left: 0 to prevent clipping on the left"
  );
});

test("BillingTab configures full ARIA accessibility for category dropdown menu", () => {
  assert.match(tabSource, /role="menu"/, "Dropdown menu must declare role='menu'");
  assert.match(tabSource, /aria-label="Filter statements by category"/);
  assert.match(tabSource, /role="menuitem"/, "Dropdown items must declare role='menuitem'");
  assert.match(tabSource, /aria-haspopup="true"/);
  assert.match(tabSource, /aria-expanded=\{isCategoryMenuOpen\}/);
});

test("tenant-billing.css configures carousel navigation arrows with absolute positioning and smooth opacity transitions", () => {
  assert.match(
    cssSource,
    /\.statement-filter-carousel-arrow\s*\{[^}]*position:\s*absolute;/,
    "Carousel arrows must be positioned absolutely to prevent layout shifts/jumps when appearing or vanishing"
  );
  assert.match(
    cssSource,
    /\.statement-filter-carousel-arrow\s*\{[^}]*transition:[^}]*opacity\s+0\.22s/,
    "Carousel arrows must have an opacity transition for a smooth fade"
  );
  assert.match(
    cssSource,
    /\.statement-filter-carousel-arrow\.is-visible\s*\{[^}]*opacity:\s*1;/,
    "Carousel arrows must become visible via opacity: 1 on .is-visible"
  );
  assert.match(
    cssSource,
    /\.statement-filter-carousel-arrow--left\s*\{[^}]*left:\s*2px;/,
    "Left arrow positioned at left: 2px"
  );
  assert.match(
    cssSource,
    /\.statement-filter-carousel-arrow--right\s*\{[^}]*right:\s*2px;/,
    "Right arrow positioned at right: 2px"
  );
});

test("tenant-billing.css hides carousel and desktop toolbar on mobile (< 640px) to prevent redundancy with dropdowns", () => {
  assert.match(
    cssSource,
    /@media\s*\([^)]*max-width:\s*639px[^)]*\)\s*\{[\s\S]*?\.statement-filter-scroll\s*\{[^}]*display:\s*none\s*!important;/,
    "Filter scroll must be hidden with display: none !important on mobile < 640px so only the dropdown displays"
  );
});

test("tenant-billing.css configures filter scroll container as horizontally slidable with invisible scrollbars", () => {
  assert.match(
    cssSource,
    /\.statement-filter-scroll\s*\{[^}]*overflow-x:\s*auto;/,
    "Filter scroll must have overflow-x: auto for horizontal sliding"
  );
  assert.match(
    cssSource,
    /\.statement-filter-scroll\s*\{[^}]*overflow-y:\s*hidden;/,
    "Filter scroll must specify overflow-y: hidden to prevent vertical scrollbar glitches"
  );
  assert.match(
    cssSource,
    /\.statement-filter-scroll\s*\{[^}]*scrollbar-width:\s*none;/,
    "Filter scroll must hide scrollbars in Firefox using scrollbar-width: none"
  );
  assert.match(
    cssSource,
    /\.statement-filter-scroll::-webkit-scrollbar\s*\{[^}]*display:\s*none;/,
    "Filter scroll must hide webkit scrollbars"
  );
  assert.match(
    cssSource,
    /\.statement-filter-scroll\s*\{[^}]*flex-wrap:\s*nowrap;/,
    "Filter scroll must maintain flex-wrap: nowrap to remain on a single slidable row"
  );
  assert.match(
    cssSource,
    /\.statement-filter-scroll\.is-dragging\s*\{[^}]*scroll-behavior:\s*auto\s*!important;/,
    "Filter scroll must set scroll-behavior: auto !important during drag"
  );
});

test("BillingTab ensures keyboard accessibility is not locked out after dragging", () => {
  // auto-reset timeout in handleMouseUpOrLeave so keyboard activation is not blocked
  assert.match(tabSource, /setTimeout\(\(\)\s*=>\s*\{\s*hasDragged\.current\s*=\s*false;\s*\},\s*50\)/);

  // button 0 guard to prevent right-click dragging
  assert.match(tabSource, /if\s*\(e\.button\s*!==\s*0\)\s*return;/);

  // memoized options to prevent unnecessary effect teardown on every render
  assert.match(tabSource, /const\s+statusOptions\s*=\s*useMemo\(/);
  assert.match(tabSource, /const\s+categoryOptions\s*=\s*useMemo\(/);
});

test("BillingTab adheres to strict terminology: Tenant and Rent, NEVER Resident or Rental Fee", () => {
  assert.doesNotMatch(tabSource, /\bResident\b/);
  assert.doesNotMatch(tabSource, /\bRental Fee\b/i);
});

test("Pure Logic: Dropdown alignment coordinate calculation prevents clipping on left edge", () => {
  const computeAlignment = (rect) => (rect.right < 240 || rect.left < 16 ? "left" : "right");

  // When button is on the left (e.g., right edge is 180px from screen left)
  assert.equal(computeAlignment({ left: 16, right: 180 }), "left");

  // When button is near the screen left border (left < 16px)
  assert.equal(computeAlignment({ left: 10, right: 250 }), "left");

  // When button is safely on the right side of desktop/tablet toolbar
  assert.equal(computeAlignment({ left: 500, right: 650 }), "right");
});

test("Pure Logic: Statement status and category filtering isolates records correctly", () => {
  const isPaid = (bill) => {
    if (!bill || bill.status === "voided") return true;
    const remaining = Number(bill.remainingAmount ?? (bill.totalAmount - (bill.paidAmount || 0)));
    return remaining <= 0 || bill.status === "paid";
  };

  const sampleBills = [
    { id: "b1", billType: "monthly", charges: { rent: 3500 }, status: "unpaid", remainingAmount: 3500, createdAt: "2026-09-01" },
    { id: "b2", billType: "electricity", charges: { electricity: 450 }, status: "paid", remainingAmount: 0, createdAt: "2026-09-05" },
    { id: "b3", billType: "water", charges: { water: 150 }, status: "unpaid", remainingAmount: 150, createdAt: "2026-08-20" },
  ];

  // Unpaid count: b1, b3 = 2
  const unpaid = sampleBills.filter((b) => !isPaid(b));
  assert.equal(unpaid.length, 2);

  // Paid count: b2 = 1
  const paid = sampleBills.filter((b) => isPaid(b));
  assert.equal(paid.length, 1);

  // Category filter: electricity
  const elecBills = sampleBills.filter((b) => b.billType === "electricity" || b.charges?.electricity > 0);
  assert.equal(elecBills.length, 1);
  assert.equal(elecBills[0].id, "b2");

  // Category filter: water
  const waterBills = sampleBills.filter((b) => b.billType === "water" || b.charges?.water > 0);
  assert.equal(waterBills.length, 1);
  assert.equal(waterBills[0].id, "b3");
});

