# PiPara - PARA + LLM Wiki Extension for pi.dev

Combines the PARA framework (Tiago Forte) with LLM Wiki automation for personal knowledge management in the pi coding agent.

## Features

- **PARA Organization**: Projects, Areas, Resources, Archives
- **LLM Wiki**: Source ingestion with entity extraction
- **Knowledge Graph**: Entity tracking with relationships
- **Memory System**: 4-tier memory with confidence scoring
- **Hybrid Search**: BM25 + Graph + Wiki combined
- **Quality Control**: Contradiction detection, content scoring, self-heal
- **Dashboard**: HTML visualization

## Installation

```bash
# Clone the extension
git clone https://github.com/lutfi-zain/pipara.git ~/.pi/agent/extensions/pipara
```

## Tools (20 total)

### PARA Management
- `para_create` - Create project/area/resource/archive
- `para_list` - List items in category
- `para_status` - Overview of all categories
- `para_maintenance` - Weekly maintenance

### Wiki Operations
- `wiki_ingest` - Ingest source into wiki
- `wiki_query` - Query wiki for topic
- `hybrid_search` - Search all sources

### Knowledge Graph
- `graph_search` - Search entities
- `graph_traverse` - Navigate relationships
- `extract_entities` - Extract from file

### Memory System
- `memory_save` - Save to memory
- `memory_recall` - Recall memories
- `memory_consolidate` - Run consolidation

### Quality Control
- `detect_contradictions` - Find contradictions
- `content_score` - Score wiki quality
- `self_heal` - Fix issues
- `audit_trail` - Show history

### Dashboard
- `dashboard` - Text stats
- `dashboard_html` - HTML viewer

## Usage

```bash
pi --extension ~/.pi/agent/extensions/pipara/index.ts
```

Then in pi:
```
Create a project called "my-app" in projects
Show dashboard
```

## Directory Structure

```
.para/
├── projects/
│   └── my-app/
│       ├── README.md
│       ├── sources/
│       └── wiki/
├── areas/
├── resources/
└── archives/
.graph/
└── entities.json
```

## License

Apache-2.0
