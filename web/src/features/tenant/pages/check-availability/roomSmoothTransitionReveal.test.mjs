import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readCode = (relPath) => fs.readFileSync(path.resolve(__dirname, relPath), "utf-8");

describe("Room Photos & Cards Smooth Transition & Animation Reveal", () => {
  const checkAvailabilityPageCode = readCode("../CheckAvailabilityPage.jsx");
  const roomCardCode = readCode("./RoomCard.jsx");
  const checkAvailabilityCssCode = readCode("../../styles/check-availability.css");
  const roomDetailsModalCode = readCode("../../modals/RoomDetailsModal.jsx");
  const roomConfigModalCode = readCode("../../../admin/components/rooms/RoomConfigModal.jsx");
  const roomFormModalCode = readCode("../../../admin/components/rooms/RoomFormModal.jsx");
  const adminRoomConfigCssCode = readCode("../../../admin/styles/admin-room-configuration.css");

  describe("1. CheckAvailabilityPage.jsx Grid & Card Stagger", () => {
    test("passes cardIndex to RoomCard in paginatedRooms map", () => {
      assert.match(
        checkAvailabilityPageCode,
        /<RoomCard[\s\S]*?cardIndex={index}/,
        "CheckAvailabilityPage must pass cardIndex={index} to RoomCard for staggered entrance animations"
      );
    });

    test("binds dynamic transition key to ca-grid container to trigger cascade on filter or page change", () => {
      assert.match(
        checkAvailabilityPageCode,
        /className="ca-grid"[\s\S]*?key={`ca-grid-\${currentPage}-\${selectedBranch}-\${selectedRoomType}-\${selectedLeaseTermFilter}-\${minPrice}-\${maxPrice}-\${debouncedSearchQuery}`}/,
        "ca-grid must include dynamic key tracking currentPage, filters, price ranges, and search query"
      );
    });
  });

  describe("2. check-availability.css Animation Keyframes & Card Stagger", () => {
    test("defines caCardReveal keyframe with translateY and subtle scale reveal", () => {
      assert.ok(
        checkAvailabilityCssCode.includes("@keyframes caCardReveal"),
        "Must define @keyframes caCardReveal"
      );
      assert.match(
        checkAvailabilityCssCode,
        /transform:\s*translateY\(16px\)\s*scale\(0\.985\)/,
        "caCardReveal must start with translateY and subtle scale"
      );
    });

    test("binds caCardReveal animation and --card-index stagger delay to .ca-card", () => {
      assert.match(
        checkAvailabilityCssCode,
        /\.ca-card\s*{[\s\S]*?animation:\s*caCardReveal 0\.45s cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)\s*both;/,
        ".ca-card must have buttery-smooth caCardReveal cubic-bezier animation"
      );
      assert.match(
        checkAvailabilityCssCode,
        /animation-delay:\s*calc\(min\(var\(--card-index,\s*0\),\s*11\)\s*\*\s*35ms\);/,
        ".ca-card must calculate stagger delay from --card-index"
      );
    });

    test("defines enhanced ca-photo-reveal with scale reveal", () => {
      assert.match(
        checkAvailabilityCssCode,
        /@keyframes\s+ca-photo-reveal\s*{[\s\S]*?transform:\s*scale\(1\.04\)[\s\S]*?transform:\s*scale\(1\)/,
        "ca-photo-reveal must include scale(1.04) to scale(1) reveal"
      );
    });

    test("defines ca-photo-exit for carousel slide crossfade exit", () => {
      assert.ok(
        checkAvailabilityCssCode.includes("@keyframes ca-photo-exit"),
        "Must define @keyframes ca-photo-exit"
      );
      assert.ok(
        checkAvailabilityCssCode.includes(".ca-card-img--prev-slide"),
        "Must style .ca-card-img--prev-slide with exit animation"
      );
    });

    test("respects prefers-reduced-motion for .ca-card and photo transitions", () => {
      assert.match(
        checkAvailabilityCssCode,
        /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[\s\S]*?\.ca-card,[\s\S]*?\.ca-card-img--fade-in,[\s\S]*?\.ca-card-img--prev-slide[\s\S]*?animation:\s*none\s*!important;/,
        "Must disable animations on prefers-reduced-motion"
      );
    });

    test("preserves .ca-card:hover lift and image hover zoom with !important over animation layer", () => {
      assert.match(
        checkAvailabilityCssCode,
        /\.ca-card:hover\s*{[\s\S]*?transform:\s*translateY\(-4px\)\s*translateZ\(0\)\s*!important;/,
        ".ca-card:hover must use !important so caCardReveal animation does not block hover lift"
      );
      assert.match(
        checkAvailabilityCssCode,
        /\.ca-card:hover\s+\.ca-card-image-wrap\s+img\s*{[\s\S]*?transform:\s*scale\(1\.04\)\s*translateZ\(0\)\s*!important;/,
        ".ca-card:hover img must use !important so hover zoom is not suppressed"
      );
    });
  });

  describe("3. RoomCard.jsx Smooth Photo Reveal & Crossfade", () => {
    test("accepts cardIndex prop and binds --card-index style", () => {
      assert.match(
        roomCardCode,
        /cardIndex\s*=\s*0/,
        "RoomCard must accept cardIndex prop"
      );
      assert.match(
        roomCardCode,
        /style={{\s*["']--card-index["']:\s*cardIndex\s*}}/,
        "RoomCard root container must bind --card-index"
      );
    });

    test("applies ca-card-img--prev-slide to outgoing carousel slide and cleans up on animation end", () => {
      assert.match(
        roomCardCode,
        /className="ca-card-img--prev-slide"/,
        "Previous image layer must have ca-card-img--prev-slide class"
      );
      assert.match(
        roomCardCode,
        /onAnimationEnd={\(\)\s*=>\s*setPreviousImageIndex\(null\)}/,
        "Previous image layer must clean up onAnimationEnd to prevent memory/DOM leak"
      );
    });

    test("applies scale transition and cached image completion ref on current photo", () => {
      assert.match(
        roomCardCode,
        /transform:\s*isCurrentLoaded\s*\?\s*["']scale\(1\)["']\s*:\s*["']scale\(1\.04\)["']/,
        "Photo must transition scale(1.04) -> scale(1)"
      );
      assert.match(
        roomCardCode,
        /ref={\(node\)\s*=>\s*{[\s\S]*?node\.complete[\s\S]*?setLoadedMap/,
        "Must detect node.complete for instant memory-cached images"
      );
      assert.match(
        roomCardCode,
        /transition:\s*["']opacity 0\.45s cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\),\s*transform 0\.45s cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)["']/,
        "Must use buttery-smooth 0.45s cubic-bezier transition"
      );
    });
  });

  describe("4. RoomDetailsModal.jsx Cinematic Image Transitions", () => {
    test("defines rdm-crossfade and rdm-slide-exit keyframes with scale transforms", () => {
      assert.match(
        roomDetailsModalCode,
        /@keyframes\s+rdm-crossfade\s*{[\s\S]*?transform:\s*scale\(1\.035\)[\s\S]*?transform:\s*scale\(1\)/,
        "rdm-crossfade must scale from 1.035 to 1"
      );
      assert.match(
        roomDetailsModalCode,
        /@keyframes\s+rdm-slide-exit\s*{[\s\S]*?transform:\s*scale\(1\)[\s\S]*?transform:\s*scale\(0\.975\)/,
        "rdm-slide-exit must scale from 1 to 0.975"
      );
    });

    test("applies rdm-slide-exit to outgoing prevImage layer and cleans up on animation end", () => {
      assert.match(
        roomDetailsModalCode,
        /className="w-full h-full object-cover absolute inset-0 rdm-slide-exit"/,
        "Previous slide image must have rdm-slide-exit class"
      );
      assert.match(
        roomDetailsModalCode,
        /onAnimationEnd={\(\)\s*=>\s*setPrevImage\(null\)}/,
        "Previous slide must clean up onAnimationEnd"
      );
    });

    test("applies rdm-thumb-btn reveal animation and preserves hover/active transforms", () => {
      assert.match(
        roomDetailsModalCode,
        /className={`rdm-thumb-btn[\s\S]*?animationDelay:\s*`\${index\s*\*\s*40}ms`/,
        "Thumbnails must have staggered animationDelay"
      );
      assert.match(
        roomDetailsModalCode,
        /className="w-full h-full object-cover block rdm-thumb-img"/,
        "Thumbnail images must use rdm-thumb-img class"
      );
      assert.match(
        roomDetailsModalCode,
        /@keyframes\s+rdm-thumb-reveal/,
        "Must define @keyframes rdm-thumb-reveal"
      );
      assert.match(
        roomDetailsModalCode,
        /\.rdm-thumb-btn:hover\s*{[\s\S]*?transform:\s*translateY\(-2px\)\s*scale\(1\.04\)\s*!important;/,
        "Thumbnail hover lift must use !important"
      );
      assert.match(
        roomDetailsModalCode,
        /\.rdm-thumb-btn\.is-active\s*{[\s\S]*?transform:\s*scale\(1\.02\)\s*!important;/,
        "Thumbnail active scale must use !important"
      );
    });

    test("detects node.complete for cached HD and thumbnail photos and respects reduced-motion", () => {
      assert.match(
        roomDetailsModalCode,
        /ref={\(node\)\s*=>\s*{[\s\S]*?node\.complete[\s\S]*?setHdLoadedMap/,
        "HD overlay must check node.complete"
      );
      assert.match(
        roomDetailsModalCode,
        /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.rdm-thumb-img[\s\S]*?animation:\s*none\s*!important;/,
        "Must disable all animations and transitions on reduced-motion"
      );
    });
  });

  describe("5. RoomConfigModal.jsx & admin-room-configuration.css Photo Card Reveals", () => {
    test("defines rcm-photo-reveal keyframe and applies entrance animation to image-preview-card", () => {
      assert.match(
        adminRoomConfigCssCode,
        /@keyframes\s+rcm-photo-reveal\s*{[\s\S]*?transform:\s*translateY\(10px\)\s*scale\(0\.95\)[\s\S]*?transform:\s*translateY\(0\)\s*scale\(1\)/,
        "Must define rcm-photo-reveal keyframe"
      );
      assert.match(
        adminRoomConfigCssCode,
        /\.image-preview-card\s*{[\s\S]*?animation:\s*rcm-photo-reveal 0\.4s cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)\s*both;/,
        ".image-preview-card must have rcm-photo-reveal animation"
      );
      assert.match(
        adminRoomConfigCssCode,
        /\.image-preview-card:hover\s*{[\s\S]*?transform:\s*translateY\(-2px\)\s*!important;/,
        ".image-preview-card:hover must use !important so hover lift is not suppressed"
      );
      assert.match(
        adminRoomConfigCssCode,
        /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[\s\S]*?\.image-preview-card,[\s\S]*?\.image-preview-card__img[\s\S]*?animation:\s*none\s*!important;/,
        "Must support prefers-reduced-motion in admin room configuration CSS"
      );
    });

    test("applies scale transition to .image-preview-card__img and .is-loaded", () => {
      assert.match(
        adminRoomConfigCssCode,
        /\.image-preview-card__img\s*{[\s\S]*?transform:\s*scale\(1\.05\);[\s\S]*?transition:\s*opacity 0\.45s cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\),\s*transform 0\.45s cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\);/,
        ".image-preview-card__img must transition opacity and transform over 0.45s"
      );
      assert.match(
        adminRoomConfigCssCode,
        /\.image-preview-card__img\.is-loaded\s*{[\s\S]*?transform:\s*scale\(1\);/,
        ".image-preview-card__img.is-loaded must restore scale(1)"
      );
    });

    test("RoomConfigModal applies staggered animationDelay and complete ref to preview photos", () => {
      assert.match(
        roomConfigModalCode,
        /animationDelay:\s*`\${Math\.min\(idx,\s*8\)\s*\*\s*45}ms`/,
        "RoomConfigModal photo preview cards must have staggered animationDelay"
      );
      assert.match(
        roomConfigModalCode,
        /ref={\(node\)\s*=>\s*{[\s\S]*?node\.complete[\s\S]*?classList\.add\(["']is-loaded["']\)/,
        "RoomConfigModal images must check node.complete"
      );
    });
  });

  describe("6. RoomFormModal.jsx Photo Card Reveals", () => {
    test("RoomFormModal applies staggered animationDelay and complete ref to preview photos", () => {
      assert.match(
        roomFormModalCode,
        /animationDelay:\s*`\${Math\.min\(index,\s*8\)\s*\*\s*45}ms`/,
        "RoomFormModal photo preview cards must have staggered animationDelay"
      );
      assert.match(
        roomFormModalCode,
        /ref={\(node\)\s*=>\s*{[\s\S]*?node\.complete[\s\S]*?classList\.add\(["']is-loaded["']\)/,
        "RoomFormModal images must check node.complete for instant cached assets"
      );
    });
  });
});
