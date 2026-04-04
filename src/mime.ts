/**
 * Rewrites headers in a raw MIME message.
 *
 * Reads the raw stream, splits at the header/body boundary (\r\n\r\n),
 * replaces or adds specified headers, and returns the modified raw bytes.
 */
export async function rewriteMimeHeaders(
  raw: ReadableStream<Uint8Array>,
  overrides: Record<string, string>,
): Promise<Uint8Array> {
  // Read entire raw message into a buffer
  const reader = raw.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  const rawBytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    rawBytes.set(chunk, offset);
    offset += chunk.length;
  }

  // Find header/body boundary: \r\n\r\n
  const boundaryIndex = findBoundary(rawBytes);
  if (boundaryIndex === -1) {
    // No boundary found — return original (malformed message)
    return rawBytes;
  }

  // Parse headers section as text
  const decoder = new TextDecoder();
  const headerText = decoder.decode(rawBytes.subarray(0, boundaryIndex));
  const body = rawBytes.subarray(boundaryIndex); // includes the \r\n\r\n

  // Parse individual headers (handle folded/continuation lines)
  const headerLines = unfoldHeaders(headerText);

  // Build lowercase lookup of which headers to override
  const overrideLower: Record<string, string> = {};
  for (const [key, value] of Object.entries(overrides)) {
    overrideLower[key.toLowerCase()] = `${key}: ${value}`;
  }

  // Whitelist of headers to keep. Everything else (ARC, DKIM, Received,
  // Authentication-Results, Exchange internals, etc.) is stripped to avoid
  // Cloudflare SendEmail "invalid headers set" rejections.
  const keepHeaders = new Set([
    "from",
    "to",
    "cc",
    "subject",
    "date",
    "message-id",
    "references",
    "in-reply-to",
    "reply-to",
    "mime-version",
    "content-type",
    "content-transfer-encoding",
    "content-disposition",
    "list-unsubscribe",
    "list-unsubscribe-post",
    "list-id",
  ]);

  // Replace existing headers or keep as-is
  const replaced = new Set<string>();
  const newHeaderLines: string[] = [];

  for (const line of headerLines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      newHeaderLines.push(line);
      continue;
    }
    const headerName = line.substring(0, colonIndex).toLowerCase();

    // Only keep whitelisted headers
    if (!keepHeaders.has(headerName)) {
      continue;
    }

    if (overrideLower[headerName]) {
      newHeaderLines.push(overrideLower[headerName]);
      replaced.add(headerName);
    } else {
      newHeaderLines.push(line);
    }
  }

  // Add any overrides that didn't exist in original headers
  for (const [key, line] of Object.entries(overrideLower)) {
    if (!replaced.has(key)) {
      newHeaderLines.push(line);
    }
  }

  // Reconstruct
  const encoder = new TextEncoder();
  const newHeaderBytes = encoder.encode(newHeaderLines.join("\r\n"));

  const result = new Uint8Array(newHeaderBytes.length + body.length);
  result.set(newHeaderBytes, 0);
  result.set(body, newHeaderBytes.length);

  return result;
}

/** Find index of \r\n\r\n in raw bytes */
function findBoundary(bytes: Uint8Array): number {
  for (let i = 0; i < bytes.length - 3; i++) {
    if (
      bytes[i] === 0x0d &&
      bytes[i + 1] === 0x0a &&
      bytes[i + 2] === 0x0d &&
      bytes[i + 3] === 0x0a
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Unfold MIME headers: continuation lines (starting with space/tab)
 * are joined back to the previous header line.
 */
function unfoldHeaders(headerText: string): string[] {
  const rawLines = headerText.split("\r\n");
  const result: string[] = [];

  for (const line of rawLines) {
    if (line.length === 0) continue;
    if ((line[0] === " " || line[0] === "\t") && result.length > 0) {
      // Continuation line — append to previous
      result[result.length - 1] += "\r\n" + line;
    } else {
      result.push(line);
    }
  }

  return result;
}
