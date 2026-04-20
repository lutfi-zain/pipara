/**
 * PiPara Extension - PARA + LLM Wiki for pi.dev
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";

const PARA_DIR = ".para";
const WIKI_DIR = "wiki";
const SOURCES_DIR = "sources";
const GRAPH_DIR = ".graph";
const CATEGORIES = ["projects", "areas", "resources", "archives"];
const MEMORY_TIERS = ["working", "episodic", "semantic", "procedural"];
const MEMORY_FILE = ".para/memory.json";
const MEMORY_DECAY_HALF_LIFE = 90 * 24 * 60 * 60 * 1000; // 90 days in ms
const MIN_CONFIDENCE = 0.1;

let sessionMemory: any[] = [];
let initialized = false;

async function ensureDir(path) {
  if (!existsSync(path)) await mkdir(path, { recursive: true });
}

async function getParaDir(cwd, category) {
  return join(cwd, PARA_DIR, category);
}

async function getItemDir(cwd, category, name) {
  return join(cwd, PARA_DIR, category, name);
}

async function listItems(cwd, category) {
  const dir = await getParaDir(cwd, category);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const result = [];
  for (const e of entries) {
    const st = await stat(join(dir, e));
    if (st.isDirectory()) result.push(e);
  }
  return result;
}

async function itemExists(cwd, category, name) {
  const dir = await getItemDir(cwd, category, name);
  return existsSync(dir);
}

async function loadGraph(cwd) {
  const path = join(cwd, GRAPH_DIR, "entities.json");
  if (!existsSync(path)) return { entities: {} };
  try {
    const data = await readFile(path, "utf8");
    return JSON.parse(data);
  } catch {
    return { entities: {} };
  }
}

async function saveGraph(cwd, graph) {
  await ensureDir(join(cwd, GRAPH_DIR));
  await writeFile(join(cwd, GRAPH_DIR, "entities.json"), JSON.stringify(graph, null, 2));
}

async function addEntity(cwd, name, type, relatedEntity, relation) {
  const graph = await loadGraph(cwd);
  if (!graph.entities[name]) {
    graph.entities[name] = { name, type, mentions: 0, firstSeen: Date.now(), lastSeen: Date.now(), related: [] };
  }
  graph.entities[name].mentions++;
  graph.entities[name].lastSeen = Date.now();
  if (relatedEntity && relation) {
    const exists = graph.entities[name].related.some(r => r.entity === relatedEntity && r.relation === relation);
    if (!exists) graph.entities[name].related.push({ entity: relatedEntity, relation });
  }
  await saveGraph(cwd, graph);
}

// ---- PHASE 2: MEMORY PERSISTENCE ----
async function loadMemory(cwd) {
  const path = join(cwd, MEMORY_FILE);
  if (!existsSync(path)) return [];
  try {
    const data = await readFile(path, "utf8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveMemory(cwd, memory) {
  const path = join(cwd, MEMORY_FILE);
  await ensureDir(cwd);
  await writeFile(path, JSON.stringify(memory, null, 2));
}

function applyDecay(memory) {
  const now = Date.now();
  for (const m of memory) {
    if (m.superseded) continue;
    const daysActive = (now - m.updated) / MEMORY_DECAY_HALF_LIFE;
    const decayFactor = Math.exp(-daysActive * Math.LN2);
    m.confidence = Math.max(MIN_CONFIDENCE, m.originalConfidence * decayFactor);
  }
  return memory;
}

function extractEntities(content) {
  const entities = [];
  for (const m of content.matchAll(/function\s+(\w+)/g)) entities.push({ name: m[1], type: "tool" });
  for (const m of content.matchAll(/class\s+(\w+)/g)) entities.push({ name: m[1], type: "concept" });
  for (const m of content.matchAll(/import\s+.*from\s+['"]([^'"]+)['"]/g)) entities.push({ name: m[1], type: "tool" });
  for (const m of content.matchAll(/([\w./]+\.(ts|js|md|json))/g)) entities.push({ name: m[1], type: "file" });
  return entities;
}

async function searchGraph(cwd, query) {
  const graph = await loadGraph(cwd);
  const results = [];
  const q = query.toLowerCase();
  for (const e of Object.values(graph.entities)) {
    if (e.name.toLowerCase().includes(q) || e.related.some(r => r.entity.toLowerCase().includes(q))) {
      results.push(e);
    }
  }
  return results.sort((a, b) => b.mentions - a.mentions).slice(0, 10);
}

async function traverseGraph(cwd, start, relation, depth = 1) {
  const graph = await loadGraph(cwd);
  const visited = new Set();
  const results = [];
  
  function bfs(name, d) {
    if (d > depth || visited.has(name)) return;
    visited.add(name);
    const e = graph.entities[name];
    if (!e) return;
    results.push(e);
    for (const r of e.related) {
      if (!relation || r.relation === relation) bfs(r.entity, d + 1);
    }
  }
  
  bfs(start, 0);
  return results;
}

function addMemory(content, tier = "episodic", sourceTool, confidence = 0.8) {
  const id = createHash("sha256").update(content).digest("hex").slice(0, 12);
  const existing = sessionMemory.find(m => m.content.slice(0, 100) === content.slice(0, 100));
  if (existing) {
    existing.superseded = true;
  }
  sessionMemory.push({ 
    id, 
    content, 
    tier, 
    confidence, 
    originalConfidence: confidence,
    created: Date.now(), 
    updated: Date.now(), 
    sourceTool, 
    superseded: false 
  });
}

async function wikiIngest(cwd, category, itemName, sourcePath, content) {
  const itemDir = await getItemDir(cwd, category, itemName);
  await ensureDir(join(itemDir, WIKI_DIR));
  const pageName = sourcePath.split("/").pop().replace(/\.[^.]+$/, "") || "source";
  const wikiPath = join(itemDir, WIKI_DIR, `${pageName}.md`);
  
  const entities = extractEntities(content);
  for (const e of entities) await addEntity(cwd, e.name, e.type, itemName, "mentioned_in");
  
  const wiki = `# ${pageName}\n\n## Source\n${sourcePath}\n\n${content.slice(0, 500)}...\n\n## Entities\n${entities.map(e => `- ${e.name} (${e.type})`).join("\n")}`;
  await writeFile(wikiPath, wiki);
  return wikiPath;
}

async function wikiSearchAll(cwd, query) {
  const results = [];
  for (const cat of CATEGORIES) {
    const items = await listItems(cwd, cat);
    for (const item of items) {
      const wikiDir = join(await getItemDir(cwd, cat, item), WIKI_DIR);
      if (!existsSync(wikiDir)) continue;
      for (const file of await readdir(wikiDir)) {
        if (!file.endsWith(".md")) continue;
        const content = await readFile(join(wikiDir, file), "utf8");
        if (content.toLowerCase().includes(query.toLowerCase())) {
          results.push({ category: cat, item, content, score: 0.5 });
        }
      }
    }
  }
  return results.sort((a, b) => b.score - a.score);
}

export default function (pi: ExtensionAPI) {
  
  pi.on("session_start", async (event, ctx) => {
    if (initialized) return;
    initialized = true;
    for (const cat of CATEGORIES) await ensureDir(join(ctx.cwd, PARA_DIR, cat));
    await ensureDir(join(ctx.cwd, GRAPH_DIR));
    // Load persistent memory
    sessionMemory = await loadMemory(ctx.cwd);
    // Apply decay to existing memories
    sessionMemory = applyDecay(sessionMemory);
    ctx.ui.notify(`PiPara ready - ${sessionMemory.length} memories loaded`, "info");
  });

  pi.registerTool({
    name: "para_list",
    label: "PARA List",
    description: "List items in a PARA category",
    parameters: Type.Object({ 
      category: Type.Union([Type.Literal("projects"), Type.Literal("areas"), Type.Literal("resources"), Type.Literal("archives")]) 
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const items = await listItems(ctx.cwd, params.category);
      const content = items.length === 0 
        ? `No ${params.category}` 
        : `${params.category}:\n${items.map(i => "- " + i).join("\n")}`;
      return { content: [{ type: "text", text: content }], details: {} };
    },
  });

  pi.registerTool({
    name: "para_create",
    label: "PARA Create",
    description: "Create a new project, area, resource or archive",
    parameters: Type.Object({ 
      name: Type.String(), 
      category: Type.Union([Type.Literal("projects"), Type.Literal("areas"), Type.Literal("resources"), Type.Literal("archives")]),
      description: Type.Optional(Type.String())
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const exists = await itemExists(ctx.cwd, params.category, params.name);
      if (exists) return { content: [{ type: "text", text: `Already exists: ${params.name}` }], details: {} };
      const itemDir = await getItemDir(ctx.cwd, params.category, params.name);
      await ensureDir(itemDir);
      await ensureDir(join(itemDir, SOURCES_DIR));
      await ensureDir(join(itemDir, WIKI_DIR));
      const readme = `# ${params.name}\n\n**Category**: ${params.category}\n**Created**: ${new Date().toISOString()}${params.description ? "\n\n" + params.description : ""}`;
      await writeFile(join(itemDir, "README.md"), readme);
      return { content: [{ type: "text", text: `Created: ${params.name}` }], details: {} };
    },
  });

  pi.registerTool({
    name: "para_status",
    label: "PARA Status",
    description: "Show overview of all PARA categories",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const counts = {};
      for (const cat of CATEGORIES) counts[cat] = (await listItems(ctx.cwd, cat)).length;
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      return { content: [{ type: "text", text: `## PARA\n\n${CATEGORIES.map(c => "- " + c + ": " + counts[c]).join("\n")}\n\n**Total**: ${total}` }], details: counts };
    },
  });

  pi.registerTool({
    name: "wiki_ingest",
    label: "Wiki Ingest",
    description: "Ingest a source file into wiki",
    parameters: Type.Object({ 
      item: Type.String(), 
      category: Type.Union([Type.Literal("projects"), Type.Literal("areas"), Type.Literal("resources"), Type.Literal("archives")]),
      sourcePath: Type.String()
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const exists = await itemExists(ctx.cwd, params.category, params.item);
      if (!exists) return { content: [{ type: "text", text: "Item not found" }], details: {} };
      const content = await readFile(params.sourcePath, "utf8");
      const wikiPath = await wikiIngest(ctx.cwd, params.category, params.item, params.sourcePath, content);
      return { content: [{ type: "text", text: "Ingested: " + relative(ctx.cwd, wikiPath) }], details: {} };
    },
  });

  pi.registerTool({
    name: "wiki_query",
    label: "Wiki Query",
    description: "Query the wiki for a topic",
    parameters: Type.Object({ query: Type.String() }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const results = await wikiSearchAll(ctx.cwd, params.query);
      if (results.length === 0) return { content: [{ type: "text", text: "No results: " + params.query }], details: {} };
      return { content: [{ type: "text", text: "## Results\n\n" + results.slice(0, 3).map(r => r.category + "/" + r.item + ": " + r.content.slice(0, 80) + "...").join("\n\n") }], details: {} };
    },
  });

  pi.registerTool({
    name: "graph_search",
    label: "Graph Search",
    description: "Search knowledge graph",
    parameters: Type.Object({ query: Type.String() }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const entities = await searchGraph(ctx.cwd, params.query);
      if (entities.length === 0) return { content: [{ type: "text", text: "No entities: " + params.query }], details: {} };
      return { content: [{ type: "text", text: "## Entities\n\n" + entities.map(e => "- " + e.name + " (" + e.type + ") " + e.mentions + " mentions").join("\n") }], details: {} };
    },
  });

  pi.registerTool({
    name: "graph_traverse",
    label: "Graph Traverse",
    description: "Navigate relationships",
    parameters: Type.Object({ startEntity: Type.String() }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const results = await traverseGraph(ctx.cwd, params.startEntity);
      if (results.length === 0) return { content: [{ type: "text", text: "No path: " + params.startEntity }], details: {} };
      return { content: [{ type: "text", text: "Path: " + results.map(e => e.name).join(" -> ") }], details: {} };
    },
  });

  pi.registerTool({
    name: "memory_save",
    label: "Memory Save",
    description: "Save to memory with confidence",
    parameters: Type.Object({ 
      content: Type.String(), 
      tier: Type.Optional(Type.Union([Type.Literal("working"), Type.Literal("episodic"), Type.Literal("semantic"), Type.Literal("procedural")])),
      confidence: Type.Optional(Type.Number())
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      addMemory(params.content, params.tier || "episodic", params.sourceTool, params.confidence || 0.8);
      await saveMemory(ctx.cwd, sessionMemory);
      return { content: [{ type: "text", text: `Saved with confidence ${Math.round((params.confidence || 0.8) * 100)}%` }], details: { count: sessionMemory.length } };
    },
  });

  pi.registerTool({
    name: "memory_recall",
    label: "Memory Recall",
    description: "Recall memories",
    parameters: Type.Object({ query: Type.String() }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      let results = sessionMemory.filter(m => !m.superseded && m.content.toLowerCase().includes(params.query.toLowerCase()));
      // Sort by confidence
      results.sort((a, b) => b.confidence - a.confidence);
      results = results.slice(0, 5);
      if (results.length === 0) return { content: [{ type: "text", text: "No: " + params.query }], details: {} };
      return { content: [{ type: "text", text: "## Memory (sorted by confidence)\n\n" + results.map(m => `- [${m.tier}] conf:${Math.round(m.confidence*100)}% ` + m.content.slice(0, 50)).join("\n") }], details: {} };
    },
  });

  pi.registerTool({
    name: "memory_consolidate",
    label: "Memory Consolidate",
    description: "Apply decay and show memory stats",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      // Apply decay
      sessionMemory = applyDecay(sessionMemory);
      await saveMemory(ctx.cwd, sessionMemory);
      const byTier = {};
      MEMORY_TIERS.forEach(t => byTier[t] = 0);
      sessionMemory.forEach(m => { if (!m.superseded) byTier[m.tier]++; });
      const superseded = sessionMemory.filter(m => m.superseded).length;
      const avgConf = sessionMemory.filter(m => !m.superseded).reduce((a, m) => a + m.confidence, 0) / (sessionMemory.length - superseded || 1);
      return { content: [{ type: "text", text: `## Memory\n\nActive: ${sessionMemory.length - superseded}\nSuperseded: ${superseded}\nAvg Confidence: ${Math.round(avgConf*100)}%\n\n${MEMORY_TIERS.map(t => "- " + t + ": " + byTier[t]).join("\n")}` }], details: { avgConfidence: avgConf } };
    },
  });

  pi.registerTool({
    name: "hybrid_search",
    label: "Hybrid Search",
    description: "Search wiki + graph",
    parameters: Type.Object({ query: Type.String() }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const results = [];
      const wikiResults = await wikiSearchAll(ctx.cwd, params.query);
      for (const r of wikiResults.slice(0, 3)) results.push({ source: "wiki", title: r.item, score: r.score });
      const graphResults = await searchGraph(ctx.cwd, params.query);
      for (const e of graphResults.slice(0, 3)) results.push({ source: "graph", title: e.name, score: Math.min(1, e.mentions / 10) });
      results.sort((a, b) => b.score - a.score);
      if (results.length === 0) return { content: [{ type: "text", text: "No: " + params.query }], details: {} };
      return { content: [{ type: "text", text: "## " + params.query + "\n\n" + results.slice(0, 5).map((r, i) => (i + 1) + ". [" + r.source + "] " + r.title).join("\n") }], details: {} };
    },
  });

  pi.registerTool({
    name: "extract_entities",
    label: "Extract Entities",
    description: "Extract entities from file",
    parameters: Type.Object({ filePath: Type.String() }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const content = await readFile(params.filePath, "utf8");
      const entities = extractEntities(content);
      for (const e of entities) await addEntity(ctx.cwd, e.name, e.type);
      return { content: [{ type: "text", text: "Extracted " + entities.length + ":\n\n" + entities.map(e => "- " + e.name + " (" + e.type + ")").join("\n") }], details: {} };
    },
  });

  pi.registerTool({
    name: "para_maintenance",
    label: "PARA Maintenance",
    description: "Weekly maintenance",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const warnings = [];
      for (const cat of CATEGORIES) {
        const items = await listItems(ctx.cwd, cat);
        for (const item of items) {
          const wikiDir = join(await getItemDir(ctx.cwd, cat, item), WIKI_DIR);
          if (!existsSync(wikiDir)) warnings.push(cat + "/" + item + ": no wiki");
        }
      }
      const superseded = sessionMemory.filter(m => m.superseded).length;
      return { content: [{ type: "text", text: "## Maintenance\n\n" + (warnings.length ? warnings.map(w => "- " + w).join("\n") : "All healthy") + "\n\nMemory: " + (sessionMemory.length - superseded) + " active" }], details: {} };
    },
  });

  pi.registerTool({
    name: "auto_suggest",
    label: "Auto Suggest",
    description: "Suggest next actions",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const suggestions = [];
      for (const cat of CATEGORIES) {
        const items = await listItems(ctx.cwd, cat);
        for (const item of items) {
          const wikiDir = join(await getItemDir(ctx.cwd, cat, item), WIKI_DIR);
          if (!existsSync(wikiDir)) suggestions.push({ priority: "MEDIUM", action: "Wiki for " + item });
        }
      }
      if (suggestions.length === 0) return { content: [{ type: "text", text: "No suggestions" }], details: {} };
      return { content: [{ type: "text", text: "## Suggestions\n\n" + suggestions.map(s => "- [" + s.priority + "] " + s.action).join("\n") }], details: {} };
    },
  });

  pi.registerTool({
    name: "detect_contradictions",
    label: "Detect Contradictions",
    description: "Find contradictions",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const contradictions = [];
      const graph = await loadGraph(ctx.cwd);
      for (const [name, entity] of Object.entries(graph.entities)) {
        const uses = entity.related.filter(r => r.relation === "uses").map(r => r.entity);
        const contradicts = entity.related.filter(r => r.relation === "contradicts").map(r => r.entity);
        for (const u of uses) {
          if (contradicts.includes(u)) contradictions.push({ entity: name, issue: "uses AND contradicts " + u });
        }
      }
      if (contradictions.length === 0) return { content: [{ type: "text", text: "None found" }], details: {} };
      return { content: [{ type: "text", text: "## Contradictions\n\n" + contradictions.map(c => "- " + c.entity + ": " + c.issue).join("\n") }], details: {} };
    },
  });

  pi.registerTool({
    name: "content_score",
    label: "Content Score",
    description: "Score wiki quality",
    parameters: Type.Object({ 
      item: Type.String(), 
      category: Type.Union([Type.Literal("projects"), Type.Literal("areas"), Type.Literal("resources"), Type.Literal("archives")])
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const exists = await itemExists(ctx.cwd, params.category, params.item);
      if (!exists) return { content: [{ type: "text", text: "Not found" }], details: {} };
      const wikiDir = join(await getItemDir(ctx.cwd, params.category, params.item), WIKI_DIR);
      if (!existsSync(wikiDir)) return { content: [{ type: "text", text: "No wiki" }], details: {} };
      let score = 0, pages = 0;
      for (const file of await readdir(wikiDir)) {
        if (!file.endsWith(".md")) continue;
        const content = await readFile(join(wikiDir, file), "utf8");
        if (content.includes("# ")) score += 0.2;
        if (content.length > 200) score += 0.2;
        pages++;
      }
      const avg = pages > 0 ? Math.round(score / pages * 100) : 0;
      const grade = avg >= 80 ? "A" : avg >= 60 ? "B" : avg >= 40 ? "C" : "D";
      return { content: [{ type: "text", text: "## " + params.item + "\n\nGrade: " + grade + " (" + avg + "%)" }], details: { avgScore: avg } };
    },
  });

  pi.registerTool({
    name: "self_heal",
    label: "Self Heal",
    description: "Fix issues",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const fixes = [];
      for (const cat of CATEGORIES) {
        const items = await listItems(ctx.cwd, cat);
        for (const item of items) {
          const wikiDir = join(await getItemDir(ctx.cwd, cat, item), WIKI_DIR);
          if (!existsSync(wikiDir)) { fixes.push("no wiki: " + cat + "/" + item); continue; }
          for (const file of await readdir(wikiDir)) {
            if (!file.endsWith(".md")) continue;
            const content = await readFile(join(wikiDir, file), "utf8");
            if (content.length < 100) fixes.push("small: " + file);
          }
        }
      }
      if (fixes.length === 0) return { content: [{ type: "text", text: "Healthy - no issues" }], details: {} };
      return { content: [{ type: "text", text: "## Issues\n\n" + fixes.map(f => "- " + f).join("\n") }], details: {} };
    },
  });

  pi.registerTool({
    name: "audit_trail",
    label: "Audit Trail",
    description: "Show history",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const entries = [];
      for (const cat of CATEGORIES) {
        const items = await listItems(ctx.cwd, cat);
        for (const item of items) {
          const readme = join(await getItemDir(ctx.cwd, cat, item), "README.md");
          if (existsSync(readme)) { const st = await stat(readme); entries.push({ type: cat, item, time: st.mtimeMs }); }
        }
      }
      entries.sort((a, b) => b.time - a.time);
      return { content: [{ type: "text", text: "## Trail\n\n" + entries.slice(0, 10).map(e => "- " + new Date(e.time).toLocaleString() + ": " + e.type + "/" + e.item).join("\n") }], details: {} };
    },
  });

  pi.registerTool({
    name: "dashboard",
    label: "Dashboard",
    description: "Show stats",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const counts = {};
      for (const cat of CATEGORIES) counts[cat] = (await listItems(ctx.cwd, cat)).length;
      let wikiPages = 0;
      for (const cat of CATEGORIES) {
        for (const item of await listItems(ctx.cwd, cat)) {
          const wikiDir = join(await getItemDir(ctx.cwd, cat, item), WIKI_DIR);
          if (existsSync(wikiDir)) wikiPages += (await readdir(wikiDir)).filter(f => f.endsWith(".md")).length;
        }
      }
      const graph = await loadGraph(ctx.cwd);
      const entities = Object.keys(graph.entities).length;
      const memory = sessionMemory.filter(m => !m.superseded).length;
      return { content: [{ type: "text", text: "## PiPara Dashboard\n\n**PARA**: " + Object.values(counts).reduce((a, b) => a + b, 0) + "\n**Wiki**: " + wikiPages + "\n**Entities**: " + entities + "\n**Memory**: " + memory }], details: {} };
    },
  });

  // ---- HOOK: tool_result ----
  pi.on("tool_result", async (event, ctx) => {
    // Capture errors to working memory
    if (event.isError) {
      addMemory("Error: " + event.toolName, "working", event.toolName);
    }
    
    // Extract entities from read files
    if (event.toolName === "read" && !event.isError) {
      const text = Array.isArray(event.content) ? event.content.map(c => c.type === "text" ? c.text : "").join("") : String(event.content);
      const entities = extractEntities(text);
      for (const e of entities) await addEntity(ctx.cwd, e.name, e.type);
      if (entities.length > 0) addMemory("Read: " + entities.length + " entities", "working", "read");
    }
    
    // Track significant bash actions
    if (event.toolName === "bash" && !event.isError) {
      const result = Array.isArray(event.content) ? event.content.map(c => c.type === "text" ? c.text : "").join("") : String(event.content);
      if (result.includes("git commit") || result.includes("npm publish") || result.includes("docker build")) {
        addMemory("Action: " + result.slice(0, 80), "procedural", "bash");
      }
    }
  });

  // ---- SLASH COMMANDS ----
  async function runDashboard(cwd) {
    const counts = {};
    for (const cat of CATEGORIES) counts[cat] = (await listItems(cwd, cat)).length;
    let wikiPages = 0;
    for (const cat of CATEGORIES) {
      for (const item of await listItems(cwd, cat)) {
        const wikiDir = join(await getItemDir(cwd, cat, item), WIKI_DIR);
        if (existsSync(wikiDir)) wikiPages += (await readdir(wikiDir)).filter(f => f.endsWith(".md")).length;
      }
    }
    const graph = await loadGraph(cwd);
    const entities = Object.keys(graph.entities).length;
    const memory = sessionMemory.filter(m => !m.superseded).length;
    return {
      content: [{ type: "text", text: `## PiPara Dashboard\n\n**PARA**: ${Object.values(counts).reduce((a, b) => a + b, 0)}\n**Wiki**: ${wikiPages}\n**Entities**: ${entities}\n**Memory**: ${memory}` }],
      details: { counts, wikiPages, entities, memory }
    };
  }

  async function runHealth(cwd) {
    const fixes = [];
    for (const cat of CATEGORIES) {
      const items = await listItems(cwd, cat);
      for (const item of items) {
        const wikiDir = join(await getItemDir(cwd, cat, item), WIKI_DIR);
        if (!existsSync(wikiDir)) { fixes.push("no wiki: " + cat + "/" + item); continue; }
        for (const file of await readdir(wikiDir)) {
          if (!file.endsWith(".md")) continue;
          const content = await readFile(join(wikiDir, file), "utf8");
          if (content.length < 100) fixes.push("small: " + file);
        }
      }
    }
    if (fixes.length === 0) {
      return { content: [{ type: "text", text: "## PiPara Health\n\n✅ All systems healthy - no issues found" }], details: {} };
    }
    return { content: [{ type: "text", text: "## PiPara Health\n\n⚠️ Issues found:\n\n" + fixes.map(f => "- " + f).join("\n") }], details: {} };
  }

  async function runViz(cwd) {
    const counts = {};
    for (const cat of CATEGORIES) counts[cat] = (await listItems(cwd, cat)).length;
    let wikiPages = 0;
    for (const cat of CATEGORIES) {
      for (const item of await listItems(cwd, cat)) {
        const wikiDir = join(await getItemDir(cwd, cat, item), WIKI_DIR);
        if (existsSync(wikiDir)) wikiPages += (await readdir(wikiDir)).filter(f => f.endsWith(".md")).length;
      }
    }
    const graph = await loadGraph(cwd);
    const entities = Object.values(graph.entities).sort((a, b) => b.mentions - a.mentions).slice(0, 20);
    const activeMem = sessionMemory.filter(m => !m.superseded);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>📊 PiPara Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #eee; min-height: 100vh; padding: 30px; }
    h1 { color: #4fc3f7; margin-bottom: 8px; font-size: 28px; }
    h2 { color: #81d4fa; margin: 20px 0 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
    .card { background: rgba(255,255,255,0.05); backdrop-filter: blur(10px); border-radius: 16px; padding: 24px; border: 1px solid rgba(255,255,255,0.1); }
    .stat { font-size: 42px; font-weight: 700; background: linear-gradient(135deg, #4fc3f7, #81d4fa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .stat-label { font-size: 12px; color: #888; margin-top: 8px; text-transform: uppercase; letter-spacing: 1px; }
    .section { background: rgba(255,255,255,0.03); border-radius: 16px; padding: 24px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.05); }
    .cat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .cat-card { background: rgba(255,255,255,0.03); border-radius: 12px; padding: 16px; text-align: center; }
    .cat-name { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .cat-count { font-size: 28px; font-weight: 600; color: #fff; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; margin: 2px; }
    .badge-working { background: rgba(255,107,107,0.2); color: #ff6b6b; }
    .badge-episodic { background: rgba(79,195,247,0.2); color: #4fc3f7; }
    .badge-semantic { background: rgba(129,212,250,0.2); color: #81d4fa; }
    .badge-procedural { background: rgba(200,230,201,0.2); color: #c8e6c9; }
    .entity { display: inline-block; background: rgba(79,195,247,0.15); padding: 6px 14px; border-radius: 20px; margin: 4px; font-size: 12px; border: 1px solid rgba(79,195,247,0.3); }
    .memory-item { padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 13px; }
    .timestamp { font-size: 11px; color: #666; margin-top: 4px; }
    .footer { text-align: center; margin-top: 30px; color: #555; font-size: 12px; }
  </style>
</head>
<body>
  <h1>📊 PiPara Dashboard</h1>
  <p style="color: #888; margin-bottom: 20px;">Personal Knowledge Management System</p>
  
  <div class="grid">
    <div class="card"><div class="stat">${total}</div><div class="stat-label">PARA Items</div></div>
    <div class="card"><div class="stat">${wikiPages}</div><div class="stat-label">Wiki Pages</div></div>
    <div class="card"><div class="stat">${entities.length}</div><div class="stat-label">Entities</div></div>
    <div class="card"><div class="stat">${activeMem.length}</div><div class="stat-label">Memories</div></div>
  </div>
  
  <div class="section">
    <h2>PARA Categories</h2>
    <div class="cat-grid">
      <div class="cat-card"><div class="cat-name">Projects</div><div class="cat-count">${counts.projects || 0}</div></div>
      <div class="cat-card"><div class="cat-name">Areas</div><div class="cat-count">${counts.areas || 0}</div></div>
      <div class="cat-card"><div class="cat-name">Resources</div><div class="cat-count">${counts.resources || 0}</div></div>
      <div class="cat-card"><div class="cat-name">Archives</div><div class="cat-count">${counts.archives || 0}</div></div>
    </div>
  </div>
  
  ${activeMem.length > 0 ? `
  <div class="section">
    <h2>Recent Memories</h2>
    ${activeMem.slice(-5).reverse().map(m => `
      <div class="memory-item">
        <span class="badge badge-${m.tier}">${m.tier}</span>
        ${m.content.slice(0, 80)}${m.content.length > 80 ? '...' : ''}
        <div class="timestamp">${new Date(m.created).toLocaleString()}</div>
      </div>
    `).join('')}
  </div>` : ''}
  
  ${entities.length > 0 ? `
  <div class="section">
    <h2>Top Entities</h2>
    <div style="margin-top: 12px;">${entities.map(e => `<span class="entity">${e.name} <span style="color:#666">(${e.mentions})</span></span>`).join('')}</div>
  </div>` : ''}
  
  <div class="footer">PiPara v1.0 | PARA + LLM Wiki Extension</div>
</body>
</html>`;
    
    const dashboardPath = join(cwd, ".pipara-dashboard.html");
    await writeFile(dashboardPath, html, "utf8");
    return { content: [{ type: "text", text: "## PiPara Visualization\n\n📊 Dashboard saved to: `.pipara-dashboard.html`\n\nOpen in your browser to view the interactive dashboard." }], details: { path: dashboardPath } };
  }

  // ---- REGISTER COMMANDS ----
  // Slash commands for quick access
  pi.registerCommand("pipara-dashboard", {
    description: "Show PiPara dashboard stats",
    handler: async (args, ctx) => {
      const result = await runDashboard(ctx.cwd);
      await ctx.ui.notify(result.content[0].text, "info");
    },
  });

  pi.registerCommand("pipara-health", {
    description: "Check system health",
    handler: async (args, ctx) => {
      const result = await runHealth(ctx.cwd);
      await ctx.ui.notify(result.content[0].text, result.content[0].text.includes("✅") ? "success" : "warning");
    },
  });

  pi.registerCommand("pipara-viz", {
    description: "Generate HTML visualization dashboard",
    handler: async (args, ctx) => {
      const result = await runViz(ctx.cwd);
      await ctx.ui.notify(result.content[0].text, "info");
      // Open the dashboard in browser
      const { exec } = await import("node:child_process");
      exec(`start "" "${result.details.path}"`);
      await ctx.ui.notify("Dashboard opened in browser!", "success");
    },
  });

  pi.registerCommand("pipara-help", {
    description: "Show available commands",
    handler: async (args, ctx) => {
      const helpText = "## PiPara Commands\n\n| Command | Description |\n|---------|-------------|\n| /pipara-dashboard | Show stats |\n| /pipara-health | Check issues |\n| /pipara-viz | Open dashboard |\n| /pipara-help | Show help |";
      await ctx.ui.notify(helpText, "info");
    },
  });

  // ---- HOOK: input ----
  // Removed - using registerCommand for slash commands instead
  pi.on("input", async (event, ctx) => {
    const text = event.text.trim();
    
    // Detect intent to create new project
    if (/i('m| am)?\s*(start|working|building|creating)/.test(text.toLowerCase()) || /new\s*(project|app|website)/.test(text.toLowerCase())) {
      addMemory("Intent: " + event.text.slice(0, 80), "working", "intent");
    }
    
    // Detect query intent
    if (/what\s*(do|don't)\s*i\s*(know|remember)/.test(text.toLowerCase()) || /search\s*(for|me)/.test(text.toLowerCase())) {
      addMemory("Query: " + event.text.slice(0, 80), "working", "query");
    }
    
    return { action: "continue" };
  });

  // ---- HOOK: agent_end ----
  pi.on("agent_end", async (event, ctx) => {
    // Summarize what was accomplished
    const turnCount = ctx.sessionManager.getEntries().filter(e => e.type === "message" && e.message.role === "assistant").length;
    if (turnCount > 0) {
      addMemory("Session turn: " + turnCount + " LLM responses", "episodic", "session");
    }
  });

  // ---- HOOK: session_compact ----
  pi.on("session_compact", async (event, ctx) => {
    // Crystallize session into memory
    const entries = ctx.sessionManager.getEntries();
    const assistantMsgs = entries.filter(e => e.type === "message" && e.message.role === "assistant");
    
    addMemory("Session compacted at " + new Date().toISOString() + " | " + assistantMsgs.length + " turns", "episodic", "compact");
    
    // Log to activity
    const logPath = join(ctx.cwd, PARA_DIR, "activity.md");
    const logEntry = `- ${new Date().toISOString()}: Session compacted (${assistantMsgs.length} turns)`;
    await writeFile(logPath, logEntry, { flag: "a" }).catch(() => {});
  });

  // ---- HOOK: message_end ----
  pi.on("message_end", async (event, ctx) => {
    if (event.message.role === "user") {
      const text = Array.isArray(event.message.content) 
        ? event.message.content.map(c => c.type === "text" ? c.text : "").join("") 
        : String(event.message.content);
      if (text.length > 10) {
        addMemory("User: " + text.slice(0, 100), "working", "user");
      }
    }
  });

  // ---- HOOK: session_shutdown ----
  pi.on("session_shutdown", async (event, ctx) => {
    addMemory("Session ended at " + new Date().toISOString(), "episodic", "shutdown");
    // Save memory to disk
    await saveMemory(ctx.cwd, sessionMemory);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const counts = {};
    for (const cat of CATEGORIES) counts[cat] = (await listItems(ctx.cwd, cat)).length;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const graph = await loadGraph(ctx.cwd);
    const entityCount = Object.keys(graph.entities).length;
    return { message: { customType: "pipara", content: `\n## PiPara\nPARA: ${total} | Graph: ${entityCount} | Memory: ${sessionMemory.length}`, display: false } };
  });

  pi.registerTool({
    name: "dashboard_html",
    label: "Dashboard HTML",
    description: "Generate HTML dashboard viewer",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const counts = {};
      for (const cat of CATEGORIES) counts[cat] = (await listItems(ctx.cwd, cat)).length;
      let wikiPages = 0;
      for (const cat of CATEGORIES) {
        for (const item of await listItems(ctx.cwd, cat)) {
          const wikiDir = join(await getItemDir(ctx.cwd, cat, item), WIKI_DIR);
          if (existsSync(wikiDir)) wikiPages += (await readdir(wikiDir)).filter(f => f.endsWith(".md")).length;
        }
      }
      const graph = await loadGraph(ctx.cwd);
      const entities = Object.values(graph.entities).sort((a, b) => b.mentions - a.mentions).slice(0, 20);
      const activeMem = sessionMemory.filter(m => !m.superseded);
      const superseded = sessionMemory.filter(m => m.superseded).length;
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>PiPara Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #1a1a2e; color: #eee; padding: 20px; }
    h1 { color: #4fc3f7; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 20px; }
    .card { background: #16213e; border-radius: 12px; padding: 20px; }
    .stat { font-size: 32px; font-weight: bold; }
    .stat-label { font-size: 12px; color: #888; margin-top: 5px; }
    .list { list-style: none; }
    .list li { padding: 8px 0; border-bottom: 1px solid #333; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; margin-right: 5px; }
    .badge-working { background: #ff6b6b; }
    .badge-episodic { background: #4fc3f7; }
    .entity { display: inline-block; background: #2d3748; padding: 4px 10px; border-radius: 15px; margin: 3px; font-size: 12px; }
  </style>
</head>
<body>
  <h1>📊 PiPara Dashboard</h1>
  <div class="grid">
    <div class="card"><div class="stat">${total}</div><div class="stat-label">PARA Items</div></div>
    <div class="card"><div class="stat">${wikiPages}</div><div class="stat-label">Wiki Pages</div></div>
    <div class="card"><div class="stat">${entities.length}</div><div class="stat-label">Entities</div></div>
    <div class="card"><div class="stat">${activeMem.length}</div><div class="stat-label">Memories</div></div>
  </div>
  <div class="grid">
    <div class="card"><h2>Projects</h2><ul class="list">${counts.projects ? counts.projects.map(i => `<li>${i}</li>`).join("") : "<li>-</li>"}</ul></div>
    <div class="card"><h2>Areas</h2><ul class="list">${counts.areas ? counts.areas.map(i => `<li>${i}</li>`).join("") : "<li>-</li>"}</ul></div>
    <div class="card"><h2>Resources</h2><ul class="list">${counts.resources ? counts.resources.map(i => `<li>${i}</li>`).join("") : "<li>-</li>"}</ul></div>
    <div class="card"><h2>Archives</h2><ul class="list">${counts.archives ? counts.archives.map(i => `<li>${i}</li>`).join("") : "<li>-</li>"}</ul></div>
  </div>
</body>
</html>`;
      
      const dashboardPath = join(ctx.cwd, ".pipara-dashboard.html");
      await writeFile(dashboardPath, html, "utf8");
      return { content: [{ type: "text", text: "## Dashboard HTML\n\nSaved: .pipara-dashboard.html\n\nOpen in browser to view." }], details: {} };
    },
  });

  console.log("[PiPara] Extension loaded - Phases 1-6 + Dashboard");
}