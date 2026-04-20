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

let sessionMemory = [];
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

function addMemory(content, tier = "episodic", sourceTool) {
  const id = createHash("sha256").update(content).digest("hex").slice(0, 12);
  const existing = sessionMemory.find(m => m.content.slice(0, 100) === content.slice(0, 100));
  if (existing) existing.superseded = true;
  sessionMemory.push({ id, content, tier, confidence: 0.8, created: Date.now(), updated: Date.now(), sourceTool, superseded: false });
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
    ctx.ui.notify("PiPara ready", "info");
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
    description: "Save to memory",
    parameters: Type.Object({ 
      content: Type.String(), 
      tier: Type.Optional(Type.Union([Type.Literal("working"), Type.Literal("episodic"), Type.Literal("semantic"), Type.Literal("procedural")]))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      addMemory(params.content, params.tier || "episodic");
      return { content: [{ type: "text", text: "Saved (" + sessionMemory.length + ")" }], details: {} };
    },
  });

  pi.registerTool({
    name: "memory_recall",
    label: "Memory Recall",
    description: "Recall memories",
    parameters: Type.Object({ query: Type.String() }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const results = sessionMemory.filter(m => !m.superseded && m.content.toLowerCase().includes(params.query.toLowerCase())).slice(0, 5);
      if (results.length === 0) return { content: [{ type: "text", text: "No: " + params.query }], details: {} };
      return { content: [{ type: "text", text: "## Memory\n\n" + results.map(m => "- [" + m.tier + "] " + m.content.slice(0, 60)).join("\n") }], details: {} };
    },
  });

  pi.registerTool({
    name: "memory_consolidate",
    label: "Memory Consolidate",
    description: "Run memory consolidation",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const byTier = {};
      MEMORY_TIERS.forEach(t => byTier[t] = 0);
      sessionMemory.forEach(m => byTier[m.tier]++);
      const superseded = sessionMemory.filter(m => m.superseded).length;
      return { content: [{ type: "text", text: "## Memory\n\nActive: " + (sessionMemory.length - superseded) + "\nSuperseded: " + superseded + "\n\n" + MEMORY_TIERS.map(t => "- " + t + ": " + byTier[t]).join("\n") }], details: {} };
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

  pi.on("tool_result", async (event, ctx) => {
    if (event.isError) addMemory("Error: " + event.toolName, "working", event.toolName);
    if (event.toolName === "read" && !event.isError) {
      const text = Array.isArray(event.content) ? event.content.map(c => c.type === "text" ? c.text : "").join("") : String(event.content);
      const entities = extractEntities(text);
      for (const e of entities) await addEntity(ctx.cwd, e.name, e.type);
    }
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