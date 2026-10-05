import { createElement, useMemo, type ReactNode } from 'react';
import { MarkdownManager } from '@tiptap/markdown';
import type { JSONContent } from '@tiptap/core';
import { X } from 'lucide-react';
import type { Artifact } from './types';
import { richNoteExtensions, safeNoteLink } from './RichNoteEditor';
import './StudyReference.css';

const markdown = new MarkdownManager({ extensions: richNoteExtensions(), markedOptions: { gfm: true, breaks: false } });

/** Reuse the note schema, but render only known React elements and safe links. */
function referenceNode(node: JSONContent, key: string, depth = 0): ReactNode {
  if (depth > 40) return null;
  const children = node.content?.map((child, index) => referenceNode(child, `${key}.${index}`, depth + 1));
  if (node.type === 'text') {
    let text: ReactNode = node.text || '';
    for (const [index, mark] of (node.marks || []).entries()) {
      const markKey = `${key}.mark.${index}`;
      if (mark.type === 'bold') text = <strong key={markKey}>{text}</strong>;
      else if (mark.type === 'italic') text = <em key={markKey}>{text}</em>;
      else if (mark.type === 'strike') text = <s key={markKey}>{text}</s>;
      else if (mark.type === 'code') text = <code key={markKey}>{text}</code>;
      else if (mark.type === 'link' && typeof mark.attrs?.href === 'string') {
        const href = safeNoteLink(mark.attrs.href);
        if (href) text = <a key={markKey} href={href} target="_blank" rel="noopener noreferrer">{text}</a>;
      }
    }
    return <span key={key}>{text}</span>;
  }
  switch (node.type) {
    case 'doc': return <div key={key}>{children}</div>;
    case 'paragraph': return <p key={key}>{children}</p>;
    case 'heading': return createElement(`h${Math.max(2, Math.min(6, Number(node.attrs?.level) || 2))}`, { key }, children);
    case 'bulletList': return <ul key={key}>{children}</ul>;
    case 'orderedList': return <ol key={key} start={Number.isSafeInteger(node.attrs?.start) ? node.attrs?.start : 1}>{children}</ol>;
    case 'listItem': return <li key={key}>{children}</li>;
    case 'taskList': return <ul key={key} className="nooks-reference-tasks">{children}</ul>;
    case 'taskItem': return <li key={key}><span className="nooks-reference-task-state" aria-label={node.attrs?.checked ? 'Completed task' : 'Incomplete task'}>{node.attrs?.checked ? '✓' : '○'}</span><div>{children}</div></li>;
    case 'blockquote': return <blockquote key={key}>{children}</blockquote>;
    case 'codeBlock': return <pre key={key}><code>{children}</code></pre>;
    case 'hardBreak': return <br key={key}/>;
    case 'horizontalRule': return <hr key={key}/>;
    case 'table': return <div key={key} className="nooks-reference-table"><table><tbody>{children}</tbody></table></div>;
    case 'tableRow': return <tr key={key}>{children}</tr>;
    case 'tableHeader': return <th key={key}>{children}</th>;
    case 'tableCell': return <td key={key}>{children}</td>;
    default: return <span key={key}>{children}</span>;
  }
}

export function referenceContent(content: string): ReactNode {
  try { return referenceNode(markdown.parse(content), 'note'); }
  catch { return <p>{content}</p>; }
}

export function StudyReference({ artifact, onClose }: { artifact: Artifact; onClose: () => void }) {
  const content = useMemo(() => referenceContent(artifact.content || ''), [artifact.id, artifact.content]);
  return <aside className="nooks-study-reference" aria-label={`Reference note: ${artifact.title || 'Untitled note'}`}>
    <header><div><span>Reference note</span><h2>{artifact.title || 'Untitled note'}</h2></div><button type="button" onClick={onClose} aria-label="Close reference note" title="Close reference note"><X size={20} aria-hidden="true"/></button></header>
    <div key={artifact.id} className="nooks-study-reference-body" tabIndex={0} aria-label="Read reference note">
      {artifact.content?.trim() ? content : <p className="nooks-reference-empty">This note has no text yet.</p>}
    </div>
  </aside>;
}

export default StudyReference;
