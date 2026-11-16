import { Fragment, type ReactNode } from "react";
import { managedImageId, type EditorNode } from "@cloudflare-ai-blog/shared";
import { safeHref, safeImage } from "@/features/blog/content-safety";

// Server component: render the supported editor JSON as React elements.
// User text remains escaped; arbitrary HTML and arbitrary node attributes are never used.
export function PostBody({
  content,
  postId,
}: {
  content: EditorNode;
  postId: string;
}) {
  function render(node: EditorNode, depth = 0): ReactNode {
    if (depth > 30) return null;
    const children = node.content?.map((child, index) => (
      <Fragment key={index}>{render(child, depth + 1)}</Fragment>
    ));
    switch (node.type) {
      case "doc":
        return children;
      case "text": {
        let text: ReactNode = node.text ?? "";
        for (const [index, mark] of (node.marks ?? []).entries()) {
          if (mark.type === "bold") text = <strong key={index}>{text}</strong>;
          if (mark.type === "italic") text = <em key={index}>{text}</em>;
          if (mark.type === "strike") text = <s key={index}>{text}</s>;
          if (mark.type === "link") {
            const href = safeHref(mark.attrs?.href);
            if (href)
              text = (
                <a
                  key={index}
                  href={href}
                  rel={
                    href.startsWith("http") ? "noopener noreferrer" : undefined
                  }
                >
                  {text}
                </a>
              );
          }
        }
        return text;
      }
      case "paragraph":
        return <p>{children}</p>;
      case "heading":
        return node.attrs?.level === 3 ? (
          <h3>{children}</h3>
        ) : (
          <h2>{children}</h2>
        );
      case "bulletList":
        return <ul>{children}</ul>;
      case "orderedList":
        return (
          <ol
            start={
              typeof node.attrs?.start === "number" &&
              Number.isSafeInteger(node.attrs.start) &&
              node.attrs.start > 0
                ? node.attrs.start
                : 1
            }
          >
            {children}
          </ol>
        );
      case "listItem":
        return <li>{children}</li>;
      case "blockquote":
        return <blockquote>{children}</blockquote>;
      case "hardBreak":
        return <br />;
      case "horizontalRule":
        return <hr />;
      case "image": {
        const mediaId = managedImageId(node.attrs?.src);
        const src = mediaId
          ? `/media/${encodeURIComponent(postId)}/${encodeURIComponent(mediaId)}`
          : safeImage(node.attrs?.src);
        const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
        if (!src) return null;
        return (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              width={1200}
              height={800}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </figure>
        );
      }
      default:
        return null;
    }
  }
  return <div className="post-prose">{render(content)}</div>;
}
