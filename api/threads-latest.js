const THREADS_USERNAME = "gagesalzano";
const PROFILE_URL = `https://www.threads.com/@${THREADS_USERNAME}`;
const USER_AGENT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

function decodeJsonString(value) {
  return JSON.parse(`"${value}"`);
}

function extractPlaintext(postChunk) {
  const match = postChunk.match(/"plaintext":"((?:\\.|[^"\\])*)"/);
  return match ? decodeJsonString(match[1]) : "";
}

function isOriginalPost(postChunk) {
  const isReply = postChunk.match(/"is_reply":(true|false)/);
  const quotedPost = postChunk.match(/"quoted_post":(null|\{)/);
  const repostedPost = postChunk.match(/"reposted_post":(null|\{)/);

  return (
    isReply?.[1] === "false" &&
    quotedPost?.[1] === "null" &&
    repostedPost?.[1] === "null"
  );
}

function parseLatestOriginalPosts(html, limit = 3) {
  const start = html.indexOf('"thread_items":[');
  if (start === -1) return [];

  const chunks = html.slice(start).split('"parent_post_unavailable_reason"').slice(1);
  const posts = [];
  const seen = new Set();

  for (const chunk of chunks) {
    if (!isOriginalPost(chunk)) continue;

    const text = extractPlaintext(chunk).trim();
    const code = chunk.match(/"code":"([^"]+)"/)?.[1];
    const takenAt = Number(chunk.match(/"taken_at":(\d+)/)?.[1] || 0);

    if (!text || !code || seen.has(code)) continue;
    seen.add(code);

    posts.push({
      text,
      code,
      takenAt,
      url: `https://www.threads.com/@${THREADS_USERNAME}/post/${code}`,
    });
  }

  return posts
    .sort(function (a, b) {
      return b.takenAt - a.takenAt;
    })
    .slice(0, limit)
    .map(function (post) {
      return {
        text: post.text,
        code: post.code,
        url: post.url,
      };
    });
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const response = await fetch(PROFILE_URL, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(`Threads profile request failed (${response.status})`);
    }

    const html = await response.text();
    const posts = parseLatestOriginalPosts(html, 3);

    if (!posts.length) {
      return res.status(404).json({ error: "No original posts found" });
    }

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      username: THREADS_USERNAME,
      posts,
      text: posts[0].text,
      url: posts[0].url,
      code: posts[0].code,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Unable to fetch latest Threads post",
      detail: error.message,
    });
  }
};
