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
- [x] Add confidence field to all memory structures
- [x] Implement decay calculation and application
- [x] Create `memory_consolidate` tool with tier analysis
- [x] Add memory persistence (JSON file)
- [x] Implement supersession logic
- [x] Add confidence display in memory recall
- [ ] ~~Update wiki pages with confidence metadata~~ (optional, Phase 6)

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
- [x] Expand `extractEntities()` to detect all entity types
- [x] Add relationship extraction from content
- [x] Implement graph persistence (`.graph/entities.json`)
- [x] Create `graph_traverse` tool with depth/breadth limits
- [x] Add entity linking in wiki pages
- [x] Update `wiki_ingest` to add entity relationships
- [ ] ~~Add graph visualization~~ (Phase 6 dashboard)

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
- [ ] Implement lightweight BM25 in pure JS (no extra deps for Termux)
- [ ] Add scale-based tier: simple search <50 pages, BM25 50-200
- [ ] Create `index.md` generation and maintenance
- [ ] Implement RRF fusion algorithm
- [ ] Update `wiki_query` to use hybrid search
- [ ] Add search result scoring and ranking
- [ ] Performance optimization for large wikis

### Pi.dev Context Needed
- External APIs: Web search integration if needed (optional)
- Async operations: `async execute()` with progress updates
- Large data handling: Streaming for big wiki indexes

---

## Phase 4 Design: Termux Android Compatibility

### Termux Constraints
- Single process, limited memory (~256MB typical)
- No heavy services (Elasticsearch, vector DBs)
- Works offline preferred
- No Docker available

### Scale-Based Approach

| Wiki Pages | Method | Memory |
|----------|--------|--------|
| < 50 | Simple keyword + index.md | <1MB |
| 50-200 | Lightweight BM25 | ~5MB |
| 200+ | External or skip BM25 |

### Implementation Options

**Option A: Simple (default for Termux)**
- Basic keyword search (already implemented)
- index.md for navigation
- No extra dependencies
- Works offline, fast

**Option B: Lightweight BM25**
- Custom JS implementation (no npm package)
- ~100 lines of code
- k1=1.5, b=0.75 standard
- Works offline

```typescript
// Simple BM25 in ~50 lines
function bm25(docTokens, avgDocLen, k1=1.5, b=0.75) {
  const docLen = docTokens.length;
  const tf = docTokens.reduce((acc, t) => acc + (t.term === token ? 1 : 0), 0);
  return (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * docLen / avgDocLen));
}
```

**Option C: Wink BM25** (if resources available)
- npm install wink-bm25-text-search
- ~2MB extra
- Better ranking

### Decision
For Termux: Start with Option A (simple), upgrade to B as wiki grows.

### RRF Formula
```typescript
function rrf(scores, k=60) {
  return scores.map((s, i) => 1 / (k + (i + 1))).reduce((a, b) => a + b, 0);
}
```

### Priority
1. index.md auto-generation (Phase 4)
2. Simple BM25 (if needed)
3. RRF fusion for combining results

---

## Option C: wink-bm25-text-search Details

### Package Info
```
name: wink-bm25-text-search
version: 3.1.2
license: MIT
size: ~2MB installed (10 packages total)
```

### Dependencies
- wink-nlp (1.14.3) - NLP processing
- wink-nlp-utils (2.1.0) - NLP utilities  
- wink-eng-lite-web-model (1.8.1) - English language model
- wink-helpers (2.0.0) - Helper functions

### Usage Example
```typescript
import { BM25 } = require('wink-bm25-text-search');

// Create BM25 instance
const bm25 = new BM25();

// Add documents
bm25.addDoc('doc1', 'React hooks tutorial for beginners');
bm25.addDoc('doc2', 'TypeScript advanced patterns');
bm25.addDoc('doc3', 'Building React apps with TypeScript');

// Index
bm25.index();

// Search
const results = bm25.search('React TypeScript');
// Returns: [{doc: 'doc3', score: 0.8}, {doc: 'doc1', score: 0.5}, ...]
```

### Pros
- Full BM25 implementation with Okapi scoring
- Built-in text preprocessing (tokenization, stemming)
- Configurable parameters
- Semantic search support
- Actively maintained (last: ~1 year ago)

### Cons
- 2MB+ installed size
- Heavy dependencies (NLP libraries)
- May be slow on older Android devices
- Requires npm install - adds to package.json

### Termux Test Results (just now)
```
sizes: ~2MB total (10 packages)
install time: ~3 seconds
works: Yes
```

### Recommendation
Use Option C **only if**:
- Wiki has 50+ pages
- Device has 500MB+ free storage
- User explicitly requests better search

For most users: Option A (simple) is sufficient.

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

---

## Evaluation & Testing Procedures

### How to Test PiPara Extension

#### 1. Push Changes to GitHub
```bash
cd ~/.pi/agent/git/github.com/lutfi-zain/pipara
git add -A
git commit -m "Description"
git push origin master
```

#### 2. Update Extension in pi
```bash
pi update
```

#### 3. Test Basic Workflows

**Test PARA Creation:**
```bashnecho "Create project test-project about learning TypeScript" | pi -p
```
Expected: Project created in `.para/projects/test-project/`

**Test Memory Save:**
echo "Save memory: Testing memory with 90% confidence" | pi -p
```
Expected: Memory saved to `.para/memory.json`

**Test Memory Recall:**
echo "Recall memory testing" | pi -p
```
Expected: Returns memories sorted by confidence

**Test Memory Consolidate:**
echo "Run memory consolidate" | pi -p
```
Expected: Shows tier breakdown, avg confidence, applies decay

**Test Dashboard:**
echo "Show dashboard" | pi -p
```
Expected: Shows PARA, wiki, graph, memory counts

**Test Wiki Ingest:**
echo "Ingest source into test-project" | pi -p
```
Expected: Creates wiki page in `.para/projects/test-project/wiki/`

#### 4. Verify Persistence
- Check `.para/memory.json` exists after saving
- Run new pi session and verify memories are loaded
- Check decay application over time

#### 5. Evaluation Criteria

| Feature | What to Check | Success Metric |
|--------|---------------|----------------|
| PARA Create | Creates folder in .para/projects/ | Folder exists with README.md |
| Memory Save | Saves to .para/memory.json | File exists, has valid JSON |
| Memory Recall | Returns matching memories | Memories displayed with confidence |
| Memory Persistence | Loads on new session | Memories persist across sessions |
| Confidence | Displays in recall | Shows %, decays over time |
| Wiki Ingest | Creates .md in wiki folder | File exists with entities |
| Graph | Tracks entities | entities.json has entries |

---

## Phase 2 Completion Checklist

- [x] Memory persistence to disk (`.para/memory.json`)
- [x] Memory loads on session start
- [x] Confidence tracking (0-1 scale)
- [x] Confidence save and display
- [x] Decay mechanism (90-day half-life)
- [x] Memory consolidate applies decay
- [x] Supersession logic
- [x] Updated memory_save tool with confidence
- [x] Updated memory_recall with sorting
- [x] Session shutdown saves memory
- [ ] ~~Wiki auto-summarization (not implemented)~~
- [ ] ~~Confidence auto-decidng on read (not implemented)~~