import type { GalleryNode, ImageNode } from '../types';

function pathOrUrl(node: ImageNode): string {
  if (node.href.type === 'internal') return node.href.path;
  return node.href.url;
}

function caption(node: ImageNode): string {
  return node.title || node.altText || '(image)';
}

/**
 * v1: image nodes render as figure placeholders. Asset hosting is deferred —
 * the `data-image-ref` attribute lets a future SDD swap the placeholder for
 * a real <img> without touching the renderer.
 */
export function ImageNodeView({ node }: { node: ImageNode }) {
  return (
    <figure
      data-image-ref={pathOrUrl(node)}
      className="border border-line rounded-md bg-surface-soft p-4 text-ink-mute text-sm"
    >
      <figcaption>{caption(node)}</figcaption>
    </figure>
  );
}

export function GalleryNodeView({ node }: { node: GalleryNode }) {
  return (
    <div className="grid gap-2">
      {node.images.map((img, i) => (
        <ImageNodeView key={i} node={img} />
      ))}
    </div>
  );
}
