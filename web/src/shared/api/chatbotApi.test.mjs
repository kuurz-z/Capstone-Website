import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const chatbotApiSource = fs.readFileSync(path.join(here, "chatbotApi.js"), "utf8");

test("chatbotApi exports streamPublicChatbot, queryPublicChatbot, escalateChatbotLead, and escalateToHuman alias", () => {
  assert.match(chatbotApiSource, /export const streamPublicChatbot/);
  assert.match(chatbotApiSource, /export const queryPublicChatbot/);
  assert.match(chatbotApiSource, /export const escalateChatbotLead/);
  assert.match(chatbotApiSource, /export const escalateToHuman = escalateChatbotLead/);
  assert.match(chatbotApiSource, /export const chatbotApi = \{/);
  assert.match(chatbotApiSource, /streamPublicChatbot,/);
  assert.match(chatbotApiSource, /queryPublicChatbot,/);
  assert.match(chatbotApiSource, /escalateChatbotLead,/);
  assert.match(chatbotApiSource, /escalateToHuman,/);
});

test("escalateChatbotLead normalizes fullName/name, contactNumber/phone, and branch/preferredBranch", () => {
  assert.match(chatbotApiSource, /leadData\?\.name\s*\|\|\s*leadData\?\.fullName/);
  assert.match(chatbotApiSource, /leadData\?\.phone\s*\|\|\s*leadData\?\.contactNumber/);
  assert.match(chatbotApiSource, /leadData\?\.preferredBranch\s*\|\|\s*leadData\?\.branch/);
});

test("streamPublicChatbot uses fetch with POST /chatbot/public/stream and SSE Accept header", () => {
  assert.match(chatbotApiSource, /\/chatbot\/public\/stream/);
  assert.match(chatbotApiSource, /method:\s*"POST"/);
  assert.match(chatbotApiSource, /Accept:\s*"text\/event-stream"/);
  assert.match(chatbotApiSource, /TextDecoder\("utf-8"\)/);
});

test("streamPublicChatbot parses SSE data tokens, widgets, and actions", () => {
  assert.match(chatbotApiSource, /data:\s*/);
  assert.match(chatbotApiSource, /onToken/);
  assert.match(chatbotApiSource, /onWidget/);
  assert.match(chatbotApiSource, /onActions/);
  assert.match(chatbotApiSource, /onDone/);
  assert.match(chatbotApiSource, /onError/);
  assert.match(chatbotApiSource, /data\.event === "token"/);
  assert.match(chatbotApiSource, /data\.event === "widget"/);
  assert.match(chatbotApiSource, /data\.event === "actions"/);
  assert.match(chatbotApiSource, /data\.event === "done"/);
});

