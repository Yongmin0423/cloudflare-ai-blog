import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";

export function createEditorExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      code: false, codeBlock: false, underline: false,
      link: { openOnClick: false, autolink: false, linkOnPaste: false, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } },
    }),
    Image.configure({ allowBase64: false, HTMLAttributes: { referrerpolicy: "no-referrer" } }),
  ];
}
