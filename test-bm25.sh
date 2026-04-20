#!/bin/bash
# PiPara Phase 4 BM25 Test Script
# Usage: bash test-bm25.sh

set -e

echo "=========================================="
echo "PiPara Phase 4 BM25 Search Test"
echo "=========================================="

# Create test wiki pages
echo ""
echo "📝 Creating test wiki pages..."

# Test page 1
mkdir -p ~/.para/projects/test-project/wiki
cat > ~/.para/projects/test-project/wiki/react-hooks.md << 'EOF'
# React Hooks Tutorial
React Hooks are functions that let you use state.
## useState
The useState hook lets you add state.
## useEffect
The useEffect hook lets you perform side effects.
## Common Hooks
- useState
- useEffect  
- useContext
EOF

# Test page 2
cat > ~/.para/projects/test-project/wiki/typescript-guide.md << 'EOF'
# TypeScript Guide
TypeScript is a typed superset of JavaScript.
## Types
- string
- number
- boolean
- array
- object
## Interfaces
Interfaces define the shape of an object.
EOF

# Test page 3
cat > ~/.para/projects/test-project/wiki/react-typescript.md << 'EOF'
# React with TypeScript
Building React applications with TypeScript.
## Setup
Use create-react-app with TypeScript template.
## Typing Components
Function components with interface props.
EOF

# Test page 4
cat > ~/.para/projects/test-project/wiki/javascript-basics.md << 'EOF'
# JavaScript Basics
JavaScript is a programming language.
## Variables
let, const, var
## Functions
Functions are first-class citizens.
EOF

# Test page 5
cat > ~/.para/projects/test-project/wiki/react-state.md << 'EOF'
# React State Management
Managing state in React applications.
## useState
Basic state management with useState hook.
## useReducer
Complex state logic with useReducer.
EOF

# Test page 6  
cat > ~/.para/projects/test-project/wiki/react-effects.md << 'EOF'
# React useEffect
The useEffect hook for side effects.
## Dependencies
The second parameter is the dependency array.
## Cleanup
Return a function to clean up.
EOF

# Test page 7
cat > ~/.para/projects/test-project/wiki/typescript-types.md << 'EOF'
# TypeScript Types
TypeScript type system.
## Basic Types
string, number, boolean
## Advanced
Generics, Union types, Intersection types
EOF

# Test page 8
cat > ~/.para/projects/test-project/wiki/typescript-generics.md << 'EOF'
# TypeScript Generics
Generics provide type parameters.
## Generic Functions
function<T>(arg: T): T { return arg; }
EOF

# Test page 9
cat > ~/.para/projects/test-project/wiki/react-context.md << 'EOF'
# React Context
Context provides a way to pass data without props.
## createContext
Create context with React.createContext.
EOF

# Test page 10
cat > ~/.para/projects/test-project/wiki/react-advanced.md << 'EOF'
# Advanced React Patterns
Advanced React patterns for enterprise apps.
## Higher Order Components
Reuse component logic with HOC.
## Custom Hooks
Create custom hooks for logic reuse.
EOF

# Test page 11
cat > ~/.para/projects/test-project/wiki/react-hooks-advanced.md << 'EOF'
# Advanced React Hooks
Custom hooks and advanced patterns.
## useCallback
Memoize functions with useCallback.
## useMemo
Memoize values with useMemo.
EOF

echo "✅ Created 11 wiki pages"

# Count pages
PAGE_COUNT=$(find ~/.para/projects/test-project/wiki -name "*.md" | wc -l)
echo "📄 Total wiki pages: $PAGE_COUNT"
echo "📊 BM25 threshold: > $BM25_THRESHOLD pages"

# Run search tests
echo ""
echo "🔍 Testing BM25 Search..."
echo ""

echo "Test 1: Search for 'useState'"
echo "-----------------------------------"
echo "Search wiki useState" | pi -p 2>&1 | grep -A 10 "Found\|results"

echo ""
echo "Test 2: Search for 'typescript'"
echo "-----------------------------------"
echo "Search wiki typescript" | pi -p 2>&1 | grep -A 10 "Found\|results"

echo ""
echo "Test 3: Search for 'react hooks'"
echo "-----------------------------------"
echo "Search wiki react hooks" | pi -p 2>&1 | grep -A 10 "Found\|results"

echo ""
echo "Test 4: Search for 'generic'"
echo "-----------------------------------"
echo "Search wiki generic" | pi -p 2>&1 | grep -A 10 "Found\|results"

echo ""
echo "=========================================="
echo "Test Complete"
echo "=========================================="
echo ""
echo "Results should show ranked by relevance."
echo "BM25 is activated for >10 pages."