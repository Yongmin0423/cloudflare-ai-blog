import {
  normalizeSourceImageUrl,
  type SourceImage,
} from "@cloudflare-ai-blog/shared";

const clean = (value: unknown, length: number) =>
  typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, length)
    : "";

function imageUrl(value: unknown, pageUrl: string) {
  if (typeof value !== "string" || !value.trim()) return;
  try {
    const url = new URL(normalizeSourceImageUrl(value), pageUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !/^(?:[a-z0-9-]+\.)+[a-z][a-z0-9-]*$/i.test(url.hostname) ||
      /\.(?:localhost|local|internal|test|invalid|example)$/i.test(url.hostname)
    )
      return;
    url.hash = "";
    if (url.href.length <= 2048 && !/\.svgz?$/i.test(url.pathname))
      return url.href;
  } catch {
    return;
  }
}

export function readImageMetadata(value: unknown, pageUrl: string) {
  const images = new Map<string, Partial<SourceImage>>();
  const pending = [value];
  for (let visited = 0; pending.length && visited < 400; visited++) {
    const node = pending.pop();
    if (Array.isArray(node)) {
      pending.push(...node.slice(0, 100));
      continue;
    }
    if (!node || typeof node !== "object") continue;
    const entry = node as Record<string, unknown>;
    pending.push(...Object.values(entry).slice(0, 100));
    const types = Array.isArray(entry["@type"])
      ? entry["@type"]
      : [entry["@type"]];
    if (
      !types.some((type) =>
        [
          "ImageObject",
          "https://schema.org/ImageObject",
          "http://schema.org/ImageObject",
        ].includes(String(type)),
      )
    )
      continue;
    const url = imageUrl(entry.contentUrl ?? entry.url, pageUrl);
    if (!url) continue;
    const creatorObject = Array.isArray(entry.creator) ? null : entry.creator;
    const creatorName =
      creatorObject &&
      typeof creatorObject === "object" &&
      "name" in creatorObject
        ? creatorObject.name
        : creatorObject;
    const creator = clean(entry.creditText, 250) || clean(creatorName, 250);
    const identifier =
      typeof entry.license === "string"
        ? /^https?:\/\/creativecommons\.org\/(publicdomain\/zero\/1\.0|licenses\/by\/4\.0)\/?$/i
            .exec(entry.license.trim())?.[1]
            ?.toLowerCase()
        : undefined;
    const license =
      identifier === "publicdomain/zero/1.0"
        ? "CC0 1.0"
        : identifier === "licenses/by/4.0" && creator
          ? "CC BY 4.0"
          : null;
    images.set(url, {
      creator,
      caption: clean(entry.caption ?? entry.description, 500),
      alt: clean(entry.name, 500),
      license,
    });
  }
  return images;
}

export async function collectPageImages(
  html: string,
  pageUrl: string,
  title: string,
) {
  const candidates = new Map<string, SourceImage>();
  const metadata = new Map<string, Partial<SourceImage>>();
  const figure: { urls: string[]; caption: string }[] = [];
  let jsonLd = "";
  let openGraphUrl: string | undefined;
  function add(value: string | null, alt = "") {
    const url = imageUrl(value, pageUrl);
    if (!url) return;
    const prior = candidates.get(url);
    if (prior) {
      if (!prior.alt) prior.alt = alt;
    } else if (candidates.size < 24) {
      candidates.set(url, {
        url,
        pageUrl,
        title,
        alt,
        caption: "",
        creator: "",
        license: null,
      });
    }
    return url;
  }

  const output = new HTMLRewriter()
    .on("meta[property='og:image'], meta[property='og:image:secure_url']", {
      element(element) {
        openGraphUrl = add(element.getAttribute("content"));
      },
    })
    .on("meta[property='og:image:alt']", {
      element(element) {
        const candidate = openGraphUrl
          ? candidates.get(openGraphUrl)
          : undefined;
        if (candidate && !candidate.alt)
          candidate.alt = clean(element.getAttribute("content"), 500);
      },
    })
    .on("figure", {
      element(element) {
        const current = { urls: [] as string[], caption: "" };
        figure.push(current);
        element.onEndTag(() => {
          figure.pop();
          for (const url of current.urls) {
            const candidate = candidates.get(url);
            if (candidate && !candidate.caption)
              candidate.caption = clean(current.caption, 500);
          }
        });
      },
    })
    .on("figure figcaption", {
      text(chunk) {
        const current = figure.at(-1);
        if (current && current.caption.length < 1000)
          current.caption += chunk.text.slice(0, 1000);
      },
    })
    .on("main img, article img, figure img", {
      element(element) {
        const alt = clean(element.getAttribute("alt"), 500);
        const source =
          element.getAttribute("data-src") || element.getAttribute("src");
        const url = add(source, alt);
        const current = figure.at(-1);
        if (url && current && current.urls.length < 24) current.urls.push(url);
      },
    })
    .on("script[type='application/ld+json']", {
      element() {
        jsonLd = "";
      },
      text(chunk) {
        if (jsonLd.length < 65536) jsonLd += chunk.text.slice(0, 65536);
        if (!chunk.lastInTextNode || jsonLd.length > 65536) return;
        let value: unknown;
        try {
          value = JSON.parse(jsonLd);
        } catch {
          return;
        }
        for (const [url, entry] of readImageMetadata(value, pageUrl)) {
          if (metadata.size >= 24) break;
          if (!metadata.has(url) || entry.license) metadata.set(url, entry);
        }
      },
    })
    .transform(new Response(html));
  await output.text();
  for (const url of metadata.keys()) add(url);
  for (const [url, candidate] of candidates) {
    const entry = metadata.get(url);
    if (!entry) continue;
    candidate.caption ||= entry.caption || "";
    candidate.alt ||= entry.alt || "";
    candidate.creator = entry.creator || "";
    candidate.license = entry.license ?? null;
  }
  return [...candidates.values()]
    .sort((a, b) => Number(!!b.license) - Number(!!a.license))
    .slice(0, 8);
}
