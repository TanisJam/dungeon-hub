import type {
  RefClassFeatureNode,
  RefSubclassFeatureNode,
  RefOptionalFeatureNode,
  RefFeatNode,
} from '../types';
import { slugify } from '../slugify';

function refLink(kind: string, name: string, source: string) {
  return (
    <a
      data-compendium-ref={`${kind}|${slugify(name)}|${source}`}
      className="italic text-ink-soft underline cursor-help"
    >
      {name}
    </a>
  );
}

/** `classFeature: "Action Surge|Fighter|PHB|2"` — name | class | classSrc | level */
export function RefClassFeatureNodeView({ node }: { node: RefClassFeatureNode }) {
  const parts = node.classFeature.split('|');
  const name = parts[0] ?? '';
  const source = parts[2] || 'PHB';
  return refLink('classFeature', name, source);
}

/** `subclassFeature: "name|class|classSrc|subclass|subclassSrc|level|src"` */
export function RefSubclassFeatureNodeView({ node }: { node: RefSubclassFeatureNode }) {
  const parts = node.subclassFeature.split('|');
  const name = parts[0] ?? '';
  const source = parts[6] || parts[4] || 'PHB';
  return refLink('subclassFeature', name, source);
}

/** `optionalfeature: "name|source"` */
export function RefOptionalFeatureNodeView({ node }: { node: RefOptionalFeatureNode }) {
  const parts = node.optionalfeature.split('|');
  const name = parts[0] ?? '';
  const source = parts[1] || 'PHB';
  return refLink('optfeature', name, source);
}

/** `feat: "name|source"` */
export function RefFeatNodeView({ node }: { node: RefFeatNode }) {
  const parts = node.feat.split('|');
  const name = parts[0] ?? '';
  const source = parts[1] || 'PHB';
  return refLink('feat', name, source);
}
