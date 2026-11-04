
export function chunkText(pages, chunkSize = 1000, overlap = 200) {
  const chunks = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const text = page.text.trim();

    if (!text) continue;

    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);

      const chunk = text.slice(start, end).trim();

      if (chunk) {
        chunks.push({
          text: chunk,
          pageNumber: page.num,
          chunkIndex: chunkIndex,
        });

        chunkIndex++;
      }

      if (end === text.length) break;

      start = end - overlap;
    }
  }

  return chunks;
}
