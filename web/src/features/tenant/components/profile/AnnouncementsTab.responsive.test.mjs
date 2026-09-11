import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tabSource = readFileSync(new URL("./AnnouncementsTab.jsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../../styles/tenant-announcements.css", import.meta.url), "utf8");

test("AnnouncementsTab renders a compact mobile dropdown select with counts and hides on sm+", () => {
  // Mobile dropdown select is present with sm:hidden
  assert.match(tabSource, /<select[\s\S]*?className="[^"]*sm:hidden/);

  // Desktop filter carousel row has hidden sm:flex
  assert.match(tabSource, /className="[^"]*hidden\s+sm:flex[^"]*tenant-announcements-filter-(?:cards|carousel)/);
});

test("AnnouncementsTab implements multi-mode scrolling: wheel translation and carousel navigation arrows", () => {
  // Wheel event translation for mouse users
  assert.match(tabSource, /el\.addEventListener\("wheel"/, "Must attach wheel event listener to translate vertical wheel to horizontal scroll");

  // Chevron arrow navigation buttons
  assert.match(tabSource, /tenant-announcements-carousel-arrow--left/, "Must provide left carousel scroll button");
  assert.match(tabSource, /tenant-announcements-carousel-arrow--right/, "Must provide right carousel scroll button");
  assert.match(tabSource, /canScrollLeft \? "is-visible" : ""/, "Must toggle is-visible class instead of unmounting");
});

test("tenant-announcements.css configures carousel navigation arrows with absolute positioning and smooth opacity transitions", () => {
  assert.match(
    cssSource,
    /\.tenant-announcements-carousel-arrow\s*\{[^}]*position:\s*absolute;/,
    "Carousel arrows must be positioned absolutely to prevent layout shifts/jumps when appearing or vanishing"
  );
  assert.match(
    cssSource,
    /\.tenant-announcements-carousel-arrow\s*\{[^}]*transition:[^}]*opacity/,
    "Carousel arrows must have an opacity transition for a smooth fade"
  );
  assert.match(
    cssSource,
    /\.tenant-announcements-carousel-arrow\.is-visible\s*\{[^}]*opacity:\s*1;/,
    "Carousel arrows must become visible via opacity: 1 on .is-visible"
  );
});

test("AnnouncementsTab adheres to strict terminology: Tenant Acknowledgment Required, NEVER Resident", () => {
  assert.match(tabSource, /Tenant Acknowledgment Required/);
  assert.doesNotMatch(tabSource, /Resident Acknowledgment Required/);
});

test("tenant-announcements.css provides high-contrast dark mode styling for active filter cards", () => {
  assert.match(cssSource, /html\[data-theme="dark"\]\s+\.tenant-announcements-filter-card--active|\.dark\s+\.tenant-announcements-filter-card--active/);
});

test("tenant-announcements.css hides filter cards on mobile (< 640px) to prevent redundancy with dropdown", () => {
  assert.match(
    cssSource,
    /@media\s*\([^)]*max-width:\s*639px[^)]*\)\s*\{[\s\S]*?\.tenant-announcements-filter-cards\s*\{[^}]*display:\s*none\s*!important;/,
    "Filter cards must be hidden with display: none !important on mobile < 640px so only the dropdown displays"
  );
});

test("tenant-announcements.css configures filter cards as horizontally slidable with invisible scrollbars for >= 640px", () => {
  assert.match(
    cssSource,
    /\.tenant-announcements-filter-cards\s*\{[^}]*overflow-x:\s*auto;/,
    "Filter cards must have overflow-x: auto for horizontal sliding"
  );
  assert.match(
    cssSource,
    /\.tenant-announcements-filter-cards\s*\{[^}]*scrollbar-width:\s*none;/,
    "Filter cards must hide scrollbars in Firefox using scrollbar-width: none"
  );
  assert.match(
    cssSource,
    /\.tenant-announcements-filter-cards::-webkit-scrollbar\s*\{[^}]*display:\s*none;/,
    "Filter cards must hide webkit scrollbars"
  );
  assert.match(
    cssSource,
    /\.tenant-announcements-filter-cards\s*\{[^}]*flex-wrap:\s*nowrap;/,
    "Filter cards must maintain flex-wrap: nowrap to remain on a single slidable row"
  );
});

test("tenant-announcements.css stacks filter bar and provides full-width search below 1024px", () => {
  assert.match(
    cssSource,
    /@media\s*\([^)]*max-width:\s*1024px[^)]*\)\s*\{[\s\S]*?\.tenant-announcements-filters-bar\s*\{[^}]*flex-direction:\s*column/,
    "Filters bar must stack vertically into a column below 1024px"
  );
  assert.match(
    cssSource,
    /@media\s*\([^)]*max-width:\s*1024px[^)]*\)\s*\{[\s\S]*?\.tenant-announcements-search-wrap\s*\{[^}]*width:\s*100%/,
    "Search wrap must expand to 100% width below 1024px"
  );
});
