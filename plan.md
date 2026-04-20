# PiPara Development Plan

## Overview

PiPara combines the PARA Framework (Tiago Forte) with LLM Wiki v2 (Andrej Karpathy + extensions) to create a personal knowledge management system for pi.dev. This plan outlines the phased implementation approach.

## References

### Pi.dev Documentation
- **Extensions**: `/data/data/com.termux/files/usr/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
  - Extension API, tool registration, event hooks
  - Package installation and management
- **SDK**: `/data/data/com.termux/files/usr/lib/node_modules/@mariozechner/pi-coding-agent/docs/sdk.md`
  - Context objects, UI notifications, session management
- **TUI**: `/data/data/com.termux/files/usr/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md`
  - Slash commands, custom components
- **Packages**: `/data/data/com.termux/files/usr/lib/node_modules/@mariozechner/pi-coding-agent/docs/packages.md`
  - Package discovery and loading

### Core Concepts
- **PARA Framework**: https://www.buildingasecondbrain.com/para
- **LLM Wiki v2**: https://gist.github.com/rohitg00/agentmemory
- **Extension Examples**: `/data/data/com.termux/files/usr/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/`

---

## Phase 1: Minimal Viable (MVP)

### Context
Create basic PARA + Wiki integration. Users can create projects, add sources, and query a simple wiki. This validates the core concept with minimal features.

### Plan
- Implement PARA CRUD operations (create, list, status)
- Basic wiki ingestion (read source → extract entities → create wiki page)
- Simple wiki search (keyword matching)
- Directory structure setup

### Design
- **Directory Structure**:
  ```
  .para/
  ├── projects/     # Active short-term efforts
  │   └── my-app/
  │       ├── README.md
  │       ├── sources/   # Raw documents
  │       └── wiki/      # LLM-generated summaries
  ├── areas/
  ├── resources/
  └── archives/
  ```
- **Wiki Page Format**:
  ```markdown
  # SourceName
  ## Source
  /path/to/source
  ## Content
  [truncated source content]
  ## Entities
  - entity1 (type)
  - entity2 (type)
  ```

### Tasks
- [x] Create extension structure with TypeScript
- [x] Implement `para_create`, `para_list`, `para_status` tools
- [x] Add basic wiki ingestion (`wiki_ingest` tool)
- [x] Implement keyword-based wiki search (`wiki_query`)
- [x] Add entity extraction (regex-based: functions, classes, imports)
- [x] Create directory structure on session start
- [x] Test with one project workflow

### Pi.dev Context Needed
- Extension API: `pi.registerTool()`, tool parameters with TypeBox
- Context object: `ctx.cwd`, `ctx.ui.notify()`
- Event hooks: `pi.on("session_start")`

---

## Phase 2: Memory Lifecycle

### Context
Add confidence scoring, decay, and memory tiers. Information becomes stale over time unless reinforced. Memory persists across sessions.

### Plan
- Implement confidence scores for all knowledge
- Add memory decay (Ebbinghaus curve)
- Create memory tiers (working → episodic → semantic → procedural)
- Persist memory to disk
- Add supersession (new info marks old info stale)

### Design
- **Memory Structure**:
  ```typescript
  interface Memory {
    id: string;
    content: string;
    tier: "working" | "episodic" | "semantic" | "procedural";
    confidence: number; // 0-1
    created: number;
    updated: number;
    superseded?: boolean;
    sourceTool?: string;
  }
  ```
- **Confidence Scoring**:
  - 1.0: Multiple sources, recent, no contradictions
  - 0.8: Single strong source, recent
  - 0.5: Older source, some uncertainty
  - 0.2: Single weak source, old
- **Decay Formula**: `confidence *= Math.exp(-daysSinceUpdate / 90)`

### Tasks
- [ ] Add confidence field to all memory structures
- [ ] Implement decay calculation and application
- [ ] Create `memory_consolidate` tool with tier analysis
- [ ] Add memory persistence (JSON file)
- [ ] Implement supersession logic
- [ ] Add confidence display in memory recall
- [ ] Update wiki pages with confidence metadata

### Pi.dev Context Needed
- File I/O: Node.js `fs/promises` for persistence
- Session management: `ctx.sessionManager.getEntries()`
- Event hooks: `pi.on("session_compact")`, `pi.on("session_shutdown")`

---

## Phase 3: Knowledge Graph

### Context
Extract entities and build typed relationships. Enable graph traversal queries like "what uses X?" or "what does X depend on?".

### Plan
- Expand entity extraction (people, projects, decisions)
- Add typed relationships (uses, depends, contradicts)
- Implement graph storage (JSON format)
- Add graph traversal tools
- Integrate entity extraction into all workflows

### Design
- **Entity Types**:
  - `person`: People mentioned
  - `project`: Active efforts
  - `concept`: Ideas and topics
  - `tool`: Software and libraries
  - `decision`: Choices made
  - `file`: Code files
- **Relationship Types**:
  - `uses`: A depends on B
  - `depends_on`: A requires B
  - `contradicts`: A opposes B
  - `caused`: A led to B
  - `mentioned_in`: A appears in B
- **Graph Storage**:
  ```json
  {
    "entities": {
      "React": {
        "name": "React",
        "type": "tool",
        "mentions": 5,
        "firstSeen": 1234567890,
        "lastSeen": 1234567890,
        "related": [
          {"entity": "JavaScript", "relation": "uses"},
          {"entity": "Frontend", "relation": "mentioned_in"}
        ]
      }
    }
  }
  ```

### Tasks
- [ ] Expand `extractEntities()` to detect all entity types
- [ ] Add relationship extraction from content
- [ ] Implement graph persistence (`.graph/entities.json`)
- [ ] Create `graph_traverse` tool with depth/breadth limits
- [ ] Add entity linking in wiki pages
- [ ] Update `wiki_ingest` to add entity relationships
- [ ] Add graph visualization (basic text output)

### Pi.dev Context Needed
- File I/O: JSON read/write operations
- Tool parameters: Union types for entity/relation selection
- Error handling: Graceful degradation when graph is empty

---

## Phase 4: Hybrid Search

### Context
Scale beyond simple keyword search. Add BM25, vector search, and graph traversal for comprehensive knowledge retrieval.

### Plan
- Implement BM25 search over wiki content
- Add vector embeddings for semantic similarity
- Create Reciprocal Rank Fusion (RRF) for result combination
- Maintain index.md for small-scale, migrate to hybrid at scale

### Design
- **Search Pipeline**:
  1. BM25 keyword search (fast, exact matches)
  2. Vector semantic search (slow, conceptual matches)
  3. Graph traversal (relationship-based)
  4. RRF fusion (combine and rank results)
- **Index Structure** (for small wiki):
  ```markdown
  # PiPara Wiki Index

  ## Projects
  ### my-app
  - [React Guide](./projects/my-app/wiki/react-guide.md)
  - [API Design](./projects/my-app/wiki/api-design.md)

  ## Entities
  - React (tool): 5 mentions
  - JavaScript (tool): 3 mentions
  ```
- **RRF Formula**: `score = Σ(1/(k + rank_i))` where k=60

### Tasks
- [ ] Add BM25 implementation (or use existing library)
- [ ] Integrate vector embeddings (consider API calls)
- [ ] Create `index.md` generation and maintenance
- [ ] Implement RRF fusion algorithm
- [ ] Update `wiki_query` to use hybrid search
- [ ] Add search result scoring and ranking
- [ ] Performance optimization for large wikis

### Pi.dev Context Needed
- External APIs: Web search integration if needed
- Async operations: `async execute()` with progress updates
- Large data handling: Streaming for big wiki indexes

---

## Phase 5: Automation

### Context
Make the system run with minimal manual intervention. Auto-ingest sources, load relevant context, and maintain itself.

### Plan
- Add event-driven workflows (auto-ingest on new source)
- Implement context loading on session start
- Add scheduled maintenance (weekly linting)
- Create intelligent suggestions

### Design
- **Event Hooks**:
  ```typescript
  pi.on("tool_result", async (event, ctx) => {
    // Auto-ingest after reading files
    if (event.toolName === "read" && !event.isError) {
      // Extract and ingest
    }
  });
  ```
- **Context Loading**:
  ```typescript
  pi.on("before_agent_start", async (event, ctx) => {
    // Load relevant PARA items based on recent activity
    // Inject into system prompt
  });
  ```
- **Auto-Suggestions**:
  - Projects without wiki pages
  - Resources that could become areas
  - Outdated confidence scores

### Tasks
- [ ] Add auto-ingest hook for `read` tool results
- [ ] Implement context loading on session start
- [ ] Create scheduled maintenance (weekly)
- [ ] Add intelligent suggestions (`auto_suggest` tool)
- [ ] Update system prompt injection
- [ ] Add activity logging (`.para/activity.md`)
- [ ] Implement session crystallization

### Pi.dev Context Needed
- Event system: `pi.on()` hooks for all events
- System prompt: `before_agent_start` for context injection
- Scheduling: Basic time-based triggers
- Session management: `ctx.sessionManager` for history

---

## Phase 6: Quality Control

### Context
Self-healing wiki that maintains itself. Detect issues, propose fixes, and ensure quality over time.

### Plan
- Add content scoring and grading
- Implement contradiction detection and resolution
- Create self-healing workflows
- Add comprehensive audit trails

### Design
- **Content Scoring**:
  ```typescript
  function scoreContent(content: string): number {
    let score = 0;
    if (content.includes("# ")) score += 0.2; // Has title
    if (content.length > 200) score += 0.2; // Sufficient length
    if (content.includes("## Source")) score += 0.2; // Has source
    // etc.
    return Math.round(score * 100); // 0-100
  }
  ```
- **Quality Grades**: A (80-100), B (60-79), C (40-59), D (0-39)
- **Self-Heal Actions**:
  - Auto-fix orphan pages
  - Flag stale facts
  - Propose contradiction resolutions
  - Clean up broken links

### Tasks
- [ ] Implement content scoring algorithm
- [ ] Add quality grade calculation
- [ ] Create `content_score` tool
- [ ] Enhance `detect_contradictions` with resolution suggestions
- [ ] Implement self-healing logic (`self_heal` tool)
- [ ] Add comprehensive audit trail
- [ ] Create health dashboard and notifications

### Pi.dev Context Needed
- UI notifications: `ctx.ui.notify()` for alerts
- Error handling: Graceful failure modes
- Tool chaining: Tools calling other tools
- Progress updates: `_onUpdate` callbacks for long operations

---

## Implementation Priorities

### Immediate (Next Sprint)
1. **Memory persistence** (Phase 2) - Critical for usefulness
2. **para_move tool** (Phase 1+) - Missing core PARA workflow
3. **Graph relationships** (Phase 3) - Foundation for intelligence

### Medium-term (Next Month)
4. **Hybrid search** (Phase 4) - Scaling requirement
5. **Automation hooks** (Phase 5) - User experience
6. **Quality control** (Phase 6) - Long-term maintenance

### Success Metrics
- User can create project, add sources, query wiki in <10 minutes
- Wiki compounds: queries improve over time
- Maintenance automated: <5 min/week manual effort
- Graph reveals unknown connections
- 100% local, no cloud dependencies

## Testing Strategy

### Unit Tests
- Tool execution (happy path + error cases)
- Entity extraction accuracy
- Graph operations (add, search, traverse)
- Memory lifecycle (decay, supersession)

### Integration Tests
- End-to-end workflows (create project → ingest → query)
- Session persistence and recovery
- Multi-session memory accumulation

### User Testing
- Real usage scenarios
- Performance with growing wiki (100+ pages)
- PARA workflow validation

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| **Performance** | Start simple, optimize for scale |
| **Data loss** | Backup strategies, atomic writes |
| **Complexity** | Phased approach, validate each phase |
| **User adoption** | Clear documentation, quick start guide |
| **LLM hallucinations** | Confidence scoring, human review |

---

*Last Updated: 2026-04-20*
*PiPara Development Plan v1.0*