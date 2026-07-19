/**
 * Performs a web search using the DuckDuckGo static HTML service.
 *
 * Scrapes result blocks, parses links, titles, and snippets, and returns a structured array of top search results.
 * This is zero-dependency, lightweight, and requires no API keys.
 */
export async function performWebSearch(query: string): Promise<{ title: string; url: string; snippet: string }[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    if (!response.ok) {
      console.warn(`DuckDuckGo web search failed with status ${response.status}`);
      return [];
    }

    const html = await response.text();
    
    // Split HTML by result blocks
    const resultBlocks = html.split('<div class="result results_links results_links_deep web-result ">');
    // Remove header segment
    resultBlocks.shift();

    const results = [];
    for (const block of resultBlocks.slice(0, 5)) { // Top 5 results
      // Match URL and Title: <a class="result__url" href="[URL]">[TITLE]</a>
      const urlAndTitleMatch = block.match(/<a class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      // Match Snippet: <a class="result__snippet"[^>]*>[SNIPPET]</a>
      const snippetMatch = block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

      if (urlAndTitleMatch) {
        const rawUrl = urlAndTitleMatch[1];
        let cleanedUrl = rawUrl;
        
        // DuckDuckGo static redirect handler
        if (rawUrl.includes("uddg=")) {
          const parts = rawUrl.split("uddg=");
          if (parts[1]) {
            cleanedUrl = decodeURIComponent(parts[1].split("&")[0]);
          }
        }

        const title = urlAndTitleMatch[2]
          .replace(/<[^>]+>/g, "") // remove nested HTML tags
          .replace(/\s+/g, " ")
          .trim();

        const snippet = snippetMatch
          ? snippetMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
          : "";

        results.push({
          title,
          url: cleanedUrl,
          snippet,
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error("Error performing DuckDuckGo web search:", error);
    return [];
  }
}
