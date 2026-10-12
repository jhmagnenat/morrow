"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Background, BackgroundVariant, Controls, ReactFlow, type Node, type ReactFlowInstance } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { mapOverview } from "@/lib/mapOverview";
import { mappingKeyboardTarget } from "@/lib/mappingKeyboard";
import { colorForDomain, type Link, type Notion } from "@/lib/types";
import type { MasteryInfo } from "@/lib/mastery";
import { MASTERY_COLORS } from '@/components/NotionNode';

interface GraphProps {
  notions: Notion[];
  links: Link[];
  mastery: Record<string, MasteryInfo>;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  searchQuery: string;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onInit: (instance: ReactFlowInstance) => void;
  onClearSearch: () => void;
}

const PAGE_SIZE = 16;

export default function Graph({ notions, links, mastery, selectedNodeId, searchQuery, onSelectNode, onSelectEdge, onInit, onClearSearch }: GraphProps) {
  const map = useMemo(() => mapOverview(notions, links), [notions, links]);
  const [path, setPath] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const container=useRef<HTMLDivElement>(null);
  const keyboardSelection=useRef(selectedNodeId);
  useEffect(()=>{keyboardSelection.current=selectedNodeId;},[selectedNodeId]);
  const validPath = path.filter(id => map.byId.has(id));
  const current = validPath.at(-1);
  const query = searchQuery.trim().toLocaleLowerCase();
  const ids = query
    ? notions.filter(n => n.label.toLocaleLowerCase().includes(query)).map(n => n.id)
    : current ? map.children.get(current) ?? [] : map.roots;
  const pageCount = Math.max(1, Math.ceil(ids.length / PAGE_SIZE));
  const activePage = Math.min(page, pageCount - 1);
  const visible = ids.slice(activePage * PAGE_SIZE, (activePage + 1) * PAGE_SIZE);
  // Keep the same column count on the final page, so Up/Down retain their
  // spatial meaning when a branch spans several pages.
  const columns = Math.min(ids.length > 9 ? 4 : 3, Math.max(1, ids.length));
  const height = current || query ? 185 : 250;
  const connected = links.filter(link => (link.source === selectedNodeId || link.target === selectedNodeId) && map.byId.has(link.source) && map.byId.has(link.target));
  const open = (id: string) => {
    keyboardSelection.current=id;
    onSelectNode(id);
    container.current?.focus({preventScroll:true});
    if (map.children.get(id)?.length) {
      const existing = validPath.indexOf(id);
      setPath(existing >= 0 ? validPath.slice(0, existing + 1) : [...validPath, id]);
      setPage(0);
      if (query) onClearSearch();
    }
  };
  const onKeyDown=(event:KeyboardEvent<HTMLDivElement>)=>{
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Backspace','Escape'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing)return;
    const target=event.target as HTMLElement;
    if(target.closest('input,textarea,select,[contenteditable="true"],a,summary') || target.closest('button') && !target.closest('[data-map-topic]'))return;
    if(event.key==='Escape' && !current)return;
    event.preventDefault();event.stopPropagation();
    const selected=keyboardSelection.current;
    if(event.key==='Backspace' || event.key==='Escape') {
      if(!event.repeat && current && (!query || event.key==='Escape')){
        const parent=validPath.at(-2),siblings=parent?map.children.get(parent)??[]:map.roots;
        setPath(validPath.slice(0,-1));setPage(Math.max(0,Math.floor(siblings.indexOf(current)/PAGE_SIZE)));
        if(query)onClearSearch();
        keyboardSelection.current=current;onSelectNode(current);container.current?.focus({preventScroll:true});
      }
      return;
    }
    if(event.key==='Enter') {
      // Holding Enter must not drill through several nested branches.
      if(!event.repeat && selected && visible.includes(selected))open(selected);
      return;
    }
    const next=mappingKeyboardTarget(ids,selected,event.key,columns);
    if(!next)return;
    keyboardSelection.current=next;
    setPage(Math.floor(ids.indexOf(next)/PAGE_SIZE));
    onSelectNode(next);
    // The compact grid is already in view. Keep its camera still as selection
    // moves, and preserve a synchronous cursor during held/repeated keypresses.
    container.current?.focus({preventScroll:true});
  };
  const nodes: Node[] = visible.map((id, index) => {
    const notion = map.byId.get(id)!;
    const children = map.children.get(id) ?? [];
    const color = colorForDomain(notion.domain);
    return {
      id,
      position: { x: (index % columns) * 270, y: Math.floor(index / columns) * (height + 25) },
      style: { width: 245, height, padding: 0, border: "none", background: "transparent" },
      data: { label: (
        <button data-map-topic={id} aria-label={`Open ${notion.label}`} aria-pressed={selectedNodeId===id} onFocus={()=>{keyboardSelection.current=id;onSelectNode(id);}} onClick={event => { if (event.detail === 0) { event.stopPropagation(); open(id); } }} className="block h-full w-full rounded-xl border bg-[#28262a] p-4 text-left hover:bg-[#302d32]" style={{ borderLeftColor: selectedNodeId === id ? color : "#423e42", borderRightColor: selectedNodeId === id ? color : "#423e42", borderBottomColor: selectedNodeId === id ? color : "#423e42", borderTopColor: color, borderTopWidth: 3 }}>
          <div className="mb-2 text-[15px] font-semibold leading-snug text-[#D4C6A6]">{notion.label.replace(/^Chapter:\s*/i, "")} <span role="img" aria-label={`Mastery: ${mastery[id]?.level ?? 'unknown'}`} title={`Mastery: ${mastery[id]?.level ?? 'unknown'}${mastery[id]?.weakestDimension ? ` · Next: ${mastery[id].weakestDimension}` : ''}`} className="ml-1 inline-block h-2.5 w-2.5 rounded-full" style={{backgroundColor: MASTERY_COLORS[mastery[id]?.level ?? 'unknown']}}/></div>
          {children.length ? (
            <>
              {notion.layer === 'organizer' && !notion.definition.startsWith('Semantic navigation group:') ? <p className="whitespace-pre-line text-xs leading-relaxed text-[#8F8978]">{notion.definition}</p> : !current && !query && <div className="space-y-1 text-xs leading-snug text-[#8F8978]">
                {children.slice(0, 6).map(child => <div key={child}>{map.byId.get(child)?.label}</div>)}
              </div>}
              {current && notion.layer !== 'organizer' && <p className="line-clamp-3 text-xs leading-relaxed text-[#8F8978]">{notion.definition}</p>}
              <div className="mt-2 text-[11px]" style={{ color }}>{children.length} subtopics · Open →</div>
            </>
          ) : <p className="line-clamp-3 text-xs leading-relaxed text-[#8F8978]">{notion.definition}</p>}
        </button>
      ) },
    };
  });

  return (
    <div ref={container} tabIndex={0} aria-label="Course mapping" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Backspace Escape" onKeyDownCapture={onKeyDown} onPointerDownCapture={event=>{if(!(event.target as HTMLElement).closest('button,input,textarea,select,a,summary'))container.current?.focus({preventScroll:true});}} className="flex h-full flex-col outline-none" data-testid="compact-mapping">
      <nav aria-label="Mapping path" className="relative z-20 flex min-h-11 flex-wrap items-center gap-2 border-b border-[#423e42] px-4 py-2 text-xs text-[#8F8978]">
        <button className="hover:text-[#D4C6A6]" onClick={() => { setPath([]); setPage(0); onClearSearch(); }}>Overview</button>
        {validPath.map((id, index) => <span className="flex items-center gap-2" key={id}>› <button className="hover:text-[#D4C6A6]" onClick={() => { setPath(validPath.slice(0, index + 1)); setPage(0); }}>{map.byId.get(id)?.label}</button></span>)}
        <span className="ml-auto">{query ? `${ids.length} results` : current ? `${ids.length} subtopics` : `${ids.length} main topics`}</span>
        {connected.length > 0 && <details key={selectedNodeId} className="relative">
          <summary className="cursor-pointer">Connections ({connected.length})</summary>
          <div className="absolute right-0 top-7 max-h-64 w-72 overflow-y-auto rounded border border-[#423e42] bg-[#201f21] p-2 shadow-xl">
            {connected.map(link => <button key={link.id} className="block w-full rounded p-2 text-left hover:bg-[#302d32]" onClick={() => onSelectEdge(link.id)}>
              <span className="block text-[#D4C6A6]">{map.byId.get(link.source)?.label} → {map.byId.get(link.target)?.label}</span>
              <span className="text-[10px]">{link.type.replace("-", " ")}</span>
            </button>)}
          </div>
        </details>}
        {pageCount > 1 && <><button aria-label="Previous topics" disabled={!activePage} onClick={() => setPage(activePage - 1)} className="px-2 disabled:opacity-30">←</button><span>{activePage + 1} / {pageCount}</span><button aria-label="Next topics" disabled={activePage + 1 === pageCount} onClick={() => setPage(activePage + 1)} className="px-2 disabled:opacity-30">→</button></>}
      </nav>
      <div className="relative min-h-0 flex-1">
        <ReactFlow
          key={`${current ?? "overview"}:${activePage}:${query}:${visible.join(",")}`}
          nodes={nodes}
          edges={[]}
          onInit={onInit}
          onNodeClick={(_, node) => open(node.id)}
          colorMode="dark"
          nodesDraggable={false}
          nodesFocusable={false}
          nodesConnectable={false}
          panOnDrag={[0, 1, 2]}
          panOnScroll={false}
          zoomOnScroll
          zoomOnPinch
          selectionOnDrag={false}
          selectionKeyCode={null}
          paneClickDistance={5}
          nodeClickDistance={5}
          minZoom={0.2}
          maxZoom={2}
          fitView
          fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} />
          <Controls showInteractive={false} />
          {!visible.length && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-center text-sm text-[#8F8978]">{query ? "No matching topics" : "Your mapping is empty. Open Documents to generate it. Your cards remain in Browse."}</div>}
        </ReactFlow>
      </div>
    </div>
  );
}
