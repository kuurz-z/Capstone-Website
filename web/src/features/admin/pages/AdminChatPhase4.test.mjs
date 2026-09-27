import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("./AdminChatPage.jsx", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../../../shared/api/chatApi.js", import.meta.url), "utf8");

const chatDir = new URL("../components/chat/", import.meta.url);
const chatFiles = fs.existsSync(chatDir)
  ? fs
      .readdirSync(chatDir)
      .filter((f) => f.endsWith(".js") || f.endsWith(".jsx"))
      .map((f) => fs.readFileSync(new URL(f, chatDir), "utf8"))
      .join("\n")
  : "";
const allChatSources = `${page}\n${chatFiles}`;

test("admin chat uploads through the authenticated conversation-scoped API", () => {
  assert.match(
    api,
    /uploadAttachment:[\s\S]*FormData[\s\S]*\/chat\/admin\/conversations\/\$\{conversationId\}\/attachments/,
  );
  assert.match(
    allChatSources,
    /chatApi\.uploadAttachment\(selectedConversation\.id, item\.file\)/,
  );
  assert.doesNotMatch(allChatSources, /uploadToFirebaseStorage/);
});

test("chat attachment reads use protectedFetch rather than public storage URLs", () => {
  assert.match(api, /getAttachmentBlob:[\s\S]*protectedFetch\(url\)/);
  assert.match(allChatSources, /ProtectedChatImage/);
  assert.match(allChatSources, /handleDownloadAttachment/);
  assert.doesNotMatch(allChatSources, /href=\{doc\.url \|\| doc\.fileUrl\}/);
});

// A protected read that fails must settle on a definite, readable state. The
// original implementation only ever set the object URL, so a failed read left
// the skeleton pulsing forever — indistinguishable from a slow network and
// impossible for an admin to act on.
test("a failed protected attachment read settles on a controlled error state", () => {
  assert.match(allChatSources, /data-attachment-state="error"/);
  assert.match(allChatSources, /data-attachment-state="loading"/);
  assert.match(allChatSources, /data-attachment-state="ready"/);
  assert.match(allChatSources, /Attachment unavailable/);
  // The error branch must render before the loading branch, otherwise a
  // failure would still fall through to the pulsing skeleton.
  assert.ok(
    allChatSources.indexOf('data-attachment-state="error"') <
      allChatSources.indexOf('data-attachment-state="loading"'),
    "the error state must take precedence over the loading skeleton",
  );
  // The failure path must be reachable: the catch has to record it.
  assert.match(allChatSources, /\.catch\(\(\) => \{[\s\S]*setStatus\("error"\)/);
});

test("the failed attachment state offers a retry rather than a dead tile", () => {
  assert.match(allChatSources, /setAttempt\(\(value\) => value \+ 1\)/);
  assert.match(allChatSources, /\[attachment, attempt\]/);
});

test("administrative closure and explicit request resolution have separate controls", () => {
  assert.match(allChatSources, /allowedSupportStatuses\(concern\)/);
  assert.match(allChatSources, /Resolution note \(required\)/);
  assert.match(allChatSources, /supportStatusPayload/);
});
