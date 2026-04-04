import { describe, it, expect } from "vitest";
import { rewriteMimeHeaders } from "../src/mime";

function toStream(str: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(str));
      controller.close();
    },
  });
}

async function toString(bytes: Uint8Array): Promise<string> {
  return new TextDecoder().decode(bytes);
}

const simpleEmail =
  "From: sender@test.com\r\n" +
  "To: recipient@test.com\r\n" +
  "Subject: Hello World\r\n" +
  "Content-Type: text/plain\r\n" +
  "\r\n" +
  "Body text here";

describe("rewriteMimeHeaders", () => {
  it("replaces From header", async () => {
    const result = await rewriteMimeHeaders(toStream(simpleEmail), {
      From: '"rewritten@test.com [1/24] via shop" <noreply@drop.example.com>',
    });
    const text = await toString(result);
    expect(text).toContain(
      'From: "rewritten@test.com [1/24] via shop" <noreply@drop.example.com>',
    );
    expect(text).not.toContain("From: sender@test.com");
    expect(text).toContain("Body text here");
  });

  it("replaces Subject header", async () => {
    const result = await rewriteMimeHeaders(toStream(simpleEmail), {
      Subject: "[1/24] Hello World",
    });
    const text = await toString(result);
    expect(text).toContain("Subject: [1/24] Hello World");
    expect(text).not.toContain("Subject: Hello World\r\n");
  });

  it("replaces multiple headers", async () => {
    const result = await rewriteMimeHeaders(toStream(simpleEmail), {
      From: "<noreply@drop.example.com>",
      Subject: "[1/24] Hello World",
    });
    const text = await toString(result);
    expect(text).toContain("From: <noreply@drop.example.com>");
    expect(text).toContain("Subject: [1/24] Hello World");
  });

  it("preserves body unchanged", async () => {
    const result = await rewriteMimeHeaders(toStream(simpleEmail), {
      From: "<noreply@test.com>",
    });
    const text = await toString(result);
    expect(text).toContain("\r\n\r\nBody text here");
  });

  it("preserves unreplaced headers", async () => {
    const result = await rewriteMimeHeaders(toStream(simpleEmail), {
      From: "<noreply@test.com>",
    });
    const text = await toString(result);
    expect(text).toContain("To: recipient@test.com");
    expect(text).toContain("Content-Type: text/plain");
  });

  it("adds header if not present in original", async () => {
    const result = await rewriteMimeHeaders(toStream(simpleEmail), {
      "X-Custom": "test-value",
    });
    const text = await toString(result);
    expect(text).toContain("X-Custom: test-value");
  });

  it("handles folded headers", async () => {
    const folded =
      "From: sender@test.com\r\n" +
      "Subject: This is a very long\r\n" +
      " subject line that was folded\r\n" +
      "\r\n" +
      "Body";
    const result = await rewriteMimeHeaders(toStream(folded), {
      Subject: "New subject",
    });
    const text = await toString(result);
    expect(text).toContain("Subject: New subject");
    expect(text).not.toContain("folded");
    expect(text).toContain("Body");
  });

  it("returns original on malformed message (no boundary)", async () => {
    const noBody = "From: test@test.com\r\nSubject: Hi";
    const result = await rewriteMimeHeaders(toStream(noBody), {
      From: "new@test.com",
    });
    const text = await toString(result);
    expect(text).toBe(noBody);
  });
});
