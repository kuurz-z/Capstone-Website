import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tabSource = readFileSync(new URL("./NotificationsTab.jsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../../pages/NotificationsPage.jsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../../../admin/styles/design-tokens.css", import.meta.url), "utf8");

test("NotificationsTab renders a compact mobile dropdown select and desktop pill bar", () => {
  // Mobile dropdown select is present with sm:hidden
  assert.match(tabSource, /<select[\s\S]*?className="[^"]*sm:hidden/);

  // Desktop filter pill bar is hidden on mobile and visible on sm+
  assert.match(tabSource, /className="[^"]*hidden\s+sm:flex[^"]*notif-filter-scroll/);

  // Mobile layout wraps or stacks header cleanly to prevent crushing
  assert.match(tabSource, /flex-col\s+sm:flex-row/);
});

test("NotificationsTab provides high-contrast active filter styling in dark mode", () => {
  // Uses responsive/dark mode classes or tokens rather than dark navy on dark
  assert.match(tabSource, /dark:bg-slate-100/);
  assert.match(tabSource, /dark:text-slate-900/);
});

test("NotificationsTab implements multi-mode scrolling: wheel translation and carousel navigation arrows", () => {
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
  assert.match(tabSource, /notif-filter-carousel-arrow--left/, "Must provide left carousel scroll button");
  assert.match(tabSource, /notif-filter-carousel-arrow--right/, "Must provide right carousel scroll button");
  assert.match(tabSource, /canScrollLeft \? "is-visible" : ""/, "Must toggle is-visible class instead of unmounting");
  assert.match(tabSource, /canScrollRight \? "is-visible" : ""/, "Must toggle is-visible class for right arrow");

  // Asymmetric hysteresis thresholds to eliminate boundary flickering
  assert.match(tabSource, /el\.scrollLeft > 4 : el\.scrollLeft > 18/, "Must implement asymmetric hysteresis for scrollLeft");

  // Keyboard accessibility and ARIA
  assert.match(tabSource, /tabIndex=\{canScrollLeft \? 0 : -1\}/);
  assert.match(tabSource, /aria-hidden=\{!canScrollLeft\}/);
});

test("NotificationsTab implements click-and-drag to scroll with click prevention on drag", () => {
  assert.match(tabSource, /onMouseDown=\{handleMouseDown\}/);
  assert.match(tabSource, /onMouseMove=\{handleMouseMove\}/);
  assert.match(tabSource, /onMouseUp=\{handleMouseUpOrLeave\}/);
  assert.match(tabSource, /isDragging \? "is-dragging" : ""/);
  assert.match(tabSource, /if\s*\(hasDragged\.current\)\s*\{\s*e\.preventDefault\(\);\s*return;\s*\}/);
});

test("NotificationsPage includes mobile filter dropdown and unified carousel architecture", () => {
  // Mobile filter dropdown present in page view
  assert.match(pageSource, /<select[\s\S]*?className="[^"]*sm:hidden/);

  // Desktop filter row preserves responsive visibility and carousel
  assert.match(pageSource, /className="[^"]*hidden\s+sm:flex[^"]*notif-filter-scroll/);

  // Chevron navigation arrows in standalone NotificationsPage
  assert.match(pageSource, /notif-filter-carousel-arrow--left/);
  assert.match(pageSource, /notif-filter-carousel-arrow--right/);

  // Mouse wheel translation and drag support
  assert.match(pageSource, /el\.addEventListener\("wheel"/);
  assert.match(pageSource, /el\.scrollLeft\s*\+=\s*e\.deltaY\s*\*\s*0\.85/);
  assert.match(pageSource, /onMouseDown=\{handleMouseDown\}/);
});

test("design-tokens.css configures carousel navigation arrows with absolute positioning and smooth opacity transitions", () => {
  assert.match(
    cssSource,
    /\.notif-filter-carousel-arrow\s*\{[^}]*position:\s*absolute;/,
    "Carousel arrows must be positioned absolutely to prevent layout shifts/jumps when appearing or vanishing"
  );
  assert.match(
    cssSource,
    /\.notif-filter-carousel-arrow\s*\{[^}]*transition:[^}]*opacity\s+0\.22s/,
    "Carousel arrows must have an opacity transition for a smooth fade"
  );
  assert.match(
    cssSource,
    /\.notif-filter-carousel-arrow\.is-visible\s*\{[^}]*opacity:\s*1;/,
    "Carousel arrows must become visible via opacity: 1 on .is-visible"
  );
  assert.match(
    cssSource,
    /\.notif-filter-carousel-arrow--left\s*\{[^}]*left:\s*2px;/,
    "Left arrow positioned at left: 2px"
  );
  assert.match(
    cssSource,
    /\.notif-filter-carousel-arrow--right\s*\{[^}]*right:\s*2px;/,
    "Right arrow positioned at right: 2px"
  );
});

test("design-tokens.css hides filter cards on mobile (< 640px) to prevent redundancy with dropdown", () => {
  assert.match(
    cssSource,
    /@media\s*\([^)]*max-width:\s*639px[^)]*\)\s*\{[\s\S]*?\.notif-filter-scroll\s*\{[^}]*display:\s*none\s*!important;/,
    "Filter cards must be hidden with display: none !important on mobile < 640px so only the dropdown displays"
  );
});

test("design-tokens.css configures filter cards as horizontally slidable with invisible scrollbars for >= 640px", () => {
  assert.match(
    cssSource,
    /\.notif-filter-scroll\s*\{[^}]*overflow-x:\s*auto;/,
    "Filter scroll must have overflow-x: auto for horizontal sliding"
  );
  assert.match(
    cssSource,
    /\.notif-filter-scroll\s*\{[^}]*overflow-y:\s*hidden;/,
    "Filter scroll must specify overflow-y: hidden to prevent vertical scrollbar glitches"
  );
  assert.match(
    cssSource,
    /\.notif-filter-scroll\s*\{[^}]*scrollbar-width:\s*none;/,
    "Filter scroll must hide scrollbars in Firefox using scrollbar-width: none"
  );
  assert.match(
    cssSource,
    /\.notif-filter-scroll::-webkit-scrollbar\s*\{[^}]*display:\s*none;/,
    "Filter scroll must hide webkit scrollbars"
  );
  assert.match(
    cssSource,
    /\.notif-filter-scroll\s*\{[^}]*flex-wrap:\s*nowrap;/,
    "Filter scroll must maintain flex-wrap: nowrap to remain on a single slidable row"
  );
  assert.match(
    cssSource,
    /\.notif-filter-scroll\.is-dragging\s*\{[^}]*scroll-behavior:\s*auto\s*!important;/,
    "Filter scroll must set scroll-behavior: auto !important during drag"
  );
});

test("NotificationsTab and NotificationsPage ensure keyboard accessibility is not locked out after dragging", () => {
  // auto-reset timeout in handleMouseUpOrLeave so keyboard activation is not blocked
  assert.match(tabSource, /setTimeout\(\(\)\s*=>\s*\{\s*hasDragged\.current\s*=\s*false;\s*\},\s*50\)/);
  assert.match(pageSource, /setTimeout\(\(\)\s*=>\s*\{\s*hasDragged\.current\s*=\s*false;\s*\},\s*50\)/);

  // button 0 guard to prevent right-click dragging
  assert.match(tabSource, /if\s*\(e\.button\s*!==\s*0\)\s*return;/);
  assert.match(pageSource, /if\s*\(e\.button\s*!==\s*0\)\s*return;/);

  // memoized filterTabs to prevent unnecessary effect teardown on every render
  assert.match(tabSource, /const\s+filterTabs\s*=\s*useMemo\(/);
  assert.match(pageSource, /const\s+filterTabs\s*=\s*useMemo\(/);
});

