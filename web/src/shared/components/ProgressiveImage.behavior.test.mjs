import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const progressiveImagePath = path.join(__dirname, "ProgressiveImage.jsx");

describe("ProgressiveImage Declarative React State & Error Fallback Suite", () => {
  test("1. File exists and imports required hooks and utilities", () => {
    assert.ok(fs.existsSync(progressiveImagePath), "ProgressiveImage.jsx must exist");
    const code = fs.readFileSync(progressiveImagePath, "utf8");

    assert.match(
      code,
      /import\s+{[^}]*useState[^}]*useRef[^}]*useEffect[^}]*}\s+from\s+["']react["']/,
      "Must import useState, useRef, and useEffect from react"
    );
    assert.match(
      code,
      /import\s+{[^}]*getOptimizedUrl[^}]*getImageFallbackUrl[^}]*}\s+from\s+["']\.\.\/utils\/imageOptimizer(\.js)?["']/,
      "Must import getOptimizedUrl and getImageFallbackUrl from imageOptimizer"
    );
  });

  test("2. Implements declarative currentSrc state and eliminates imperative DOM mutation", () => {
    const code = fs.readFileSync(progressiveImagePath, "utf8");

    // Must declare currentSrc state initialized to optimizedSrc
    assert.match(
      code,
      /const\s+\[\s*currentSrc\s*,\s*setCurrentSrc\s*\]\s*=\s*useState\(\s*optimizedSrc\s*\);/,
      "Must initialize currentSrc state with optimizedSrc"
    );

    // Strictly no imperative imgRef.current.src mutation
    assert.ok(
      !code.includes("imgRef.current.src ="),
      "Must NOT imperatively mutate imgRef.current.src"
    );

    // img element must bind src to currentSrc
    assert.match(
      code,
      /<img[\s\S]*?ref=\{imgRef\}[\s\S]*?src=\{currentSrc\}/,
      "Must bind <img ref={imgRef} src={currentSrc} ... />"
    );
  });

  test("3. Synchronizes currentSrc, status, and retry ref on optimizedSrc change via useEffect", () => {
    const code = fs.readFileSync(progressiveImagePath, "utf8");

    assert.match(
      code,
      /useEffect\(\s*\(\)\s*=>\s*{\s*setCurrentSrc\(\s*optimizedSrc\s*\);\s*setStatus\(\s*["']loading["']\s*\);\s*hasRetriedRef\.current\s*=\s*false;\s*},\s*\[\s*optimizedSrc\s*\]\s*\);/,
      "Must sync currentSrc, setStatus('loading'), and reset hasRetriedRef on [optimizedSrc] changes"
    );
  });

  test("4. Implements declarative fallback retrieval and error handling in handleError", () => {
    const code = fs.readFileSync(progressiveImagePath, "utf8");

    // Retry guard on currentSrc proxy URL
    assert.match(
      code,
      /!hasRetriedRef\.current\s*&&\s*currentSrc\s*&&\s*currentSrc\.includes\(\s*["']\/api\/rooms\/photos\/optimize["']\s*\)/,
      "Must check !hasRetriedRef.current && currentSrc && currentSrc.includes('/api/rooms/photos/optimize')"
    );

    // Extract fallback from currentSrc and update state
    assert.match(
      code,
      /const\s+fallback\s*=\s*getImageFallbackUrl\(\s*currentSrc\s*\);/,
      "Must extract fallback via getImageFallbackUrl(currentSrc)"
    );
    assert.match(
      code,
      /if\s*\(\s*fallback\s*&&\s*fallback\s*!==\s*currentSrc\s*\)\s*{\s*setCurrentSrc\(\s*fallback\s*\);\s*return;\s*}/,
      "Must call setCurrentSrc(fallback) when fallback is present and different"
    );

    // Terminal error fallback
    assert.match(
      code,
      /setStatus\(\s*["']error["']\s*\);/,
      "Must set status to 'error' when fallback cannot be attempted or has already retried"
    );
  });

  test("5. Adheres to solid neutral tokens, no gradients, and accessibility invariants", () => {
    const code = fs.readFileSync(progressiveImagePath, "utf8");

    assert.ok(
      code.includes('var(--card-muted, #f1f5f9)'),
      "Placeholder and error fallback must use solid neutral token var(--card-muted, #f1f5f9)"
    );
    assert.ok(
      !code.includes("linear-gradient"),
      "Must strictly avoid linear gradients"
    );
    assert.ok(
      code.includes('role="img"'),
      "Error state must include role='img' for accessibility"
    );
    assert.ok(
      code.includes('aria-label={alt}'),
      "Error state must provide aria-label={alt}"
    );
    assert.ok(
      code.includes('aria-hidden="true"'),
      "Placeholder must have aria-hidden='true' to avoid confusing screen readers"
    );
  });
});
