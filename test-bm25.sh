#!/bin/bash
# PiPara Phase 4 BM25 Test Script
# Usage: bash test-bm25.sh

set -e

echo "=========================================="
echo "PiPara Phase 4 BM25 Search Test"
echo "=========================================="

# Create test wiki pages with BETTER content
echo ""
echo "📝 Creating improved test wiki pages..."

mkdir -p ~/.para/projects/test-project/wiki

# Test page 1 - Improved
cat > ~/.para/projects/test-project/wiki/react-hooks.md << 'ENDOFFILE'
# React Hooks Tutorial

React Hooks are functions that let you use state and other React features without writing a class.

## What are Hooks?

Hooks let you "hook into" React features like state and lifecycle methods from function components.

## useState

The `useState` hook lets you add state to functional components:

```javascript
const [count, setCount] = useState(0);
```

## useEffect

The `useEffect` hook lets you perform side effects in function components:

```javascript
useEffect(() => {
  document.title = `Count: ${count}`;
}, [count]);
```

## Common Hooks

- `useState` - Add state to components
- `useEffect` - Handle side effects
- `useContext` - Consume React context
- `useReducer` - Complex state logic

## Best Practices

1. Only call hooks at the top level
2. Only call hooks from React functions
3. Use ESLint rules for hooks

## Source

[React Hooks Documentation](https://react.dev/reference/react)
ENDOFFILE

# Test page 2 - Improved
cat > ~/.para/projects/test-project/wiki/typescript-guide.md << 'ENDOFFILE'
# TypeScript Guide

TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.

## Why TypeScript?

- **Type Safety** - Catch errors at compile time
- **Better IDE Support** - Autocomplete and refactoring
- **Self-Documenting** - Types serve as documentation

## Basic Types

```typescript
const name: string = "John";
const age: number = 30;
const active: boolean = true;
```

## Interfaces

Interfaces define the shape of an object:

```typescript
interface User {
  name: string;
  age: number;
  email?: string; // optional
}
```

## Generics

Generics provide type parameters:

```typescript
function identity<T>(arg: T): T {
  return arg;
}
```

## Common Types

- `string` - Text values
- `number` - Numeric values
- `boolean` - True/false
- `array<T>` - Arrays of type T
- `object` - Key-value pairs
- `enum` - Named constants

## Source

[TypeScript Handbook](https://www.typescriptlang.org/docs/)
ENDOFFILE

# Test page 3 - Improved
cat > ~/.para/projects/test-project/wiki/react-typescript.md << 'ENDOFFILE'
# React with TypeScript

Building React applications with TypeScript provides better type safety and developer experience.

## Setup

```bash
npx create-react-app my-app --template typescript
```

## Typing Components

Function components with typed props:

```typescript
interface Props {
  name: string;
  age: number;
}

const UserCard: React.FC<Props> = ({ name, age }) => {
  return (
    <div>
      <h2>{name}</h2>
      <p>Age: {age}</p>
    </div>
  );
};
```

## useState with Types

```typescript
const [user, setUser] = useState<User | null>(null);
```

## Best Practices

1. Define interfaces for component props
2. Use `React.FC` or regular function
3. Handle null states explicitly
4. Use TypeScript strict mode

## Source

[React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)
ENDOFFILE

# Test page 4
cat > ~/.para/projects/test-project/wiki/javascript-basics.md << 'ENDOFFILE'
# JavaScript Basics

JavaScript is a programming language for web development.

## Variables

```javascript
let name = "John";     // can be reassigned
const age = 30;        // cannot be reassigned
var old = "deprecated"; // avoid using
```

## Functions

```javascript
// Arrow function
const greet = (name) => {
  return `Hello, ${name}!`;
};

// Short syntax
const add = (a, b) => a + b;
```

## Arrays

```javascript
const nums = [1, 2, 3, 4, 5];
nums.map(n => n * 2); // [2, 4, 6, 8, 10]
nums.filter(n => n > 2); // [3, 4, 5]
```

## Objects

```javascript
const person = {
  name: "John",
  age: 30,
  greet() {
    return `Hi, I'm ${this.name}`;
  }
};
```

## Source

[MDN JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
ENDOFFILE

# Test page 5
cat > ~/.para/projects/test-project/wiki/react-state.md << 'ENDOFFILE'
# React State Management

Managing state in React applications.

## useState

Basic state management:

```javascript
const [state, setState] = useState(initialValue);
```

## useReducer

For complex state logic:

```javascript
const reducer = (state, action) => {
  switch (action.type) {
    case 'increment':
      return { count: state.count + 1 };
    default:
      return state;
  }
};

const [state, dispatch] = useReducer(reducer, { count: 0 });
```

## State Patterns

1. **Local State** - useState for component-only
2. **Lifted State** - Share between components
3. **Context** - Global state without libraries
4. **External** - Redux, Zustand for large apps

## Best Practices

- Keep state as local as possible
- Use reducer for complex updates
- Consider context for shared state

## Source

[React State Documentation](https://react.dev/learn/managing-state)
ENDOFFILE

# Test page 6
cat > ~/.para/projects/test-project/wiki/react-effects.md << 'ENDOFFILE'
# React useEffect

The useEffect hook for side effects.

## Basic Usage

```javascript
useEffect(() => {
  // Runs after every render
});
```

## With Dependencies

```javascript
useEffect(() => {
  // Runs only when count changes
}, [count]);
```

## Cleanup

Return a function to clean up:

```javascript
useEffect(() => {
  const subscription = subscribe(id);
  return () => {
    subscription.unsubscribe();
  };
}, [id]);
```

## Common Use Cases

- Fetching data
- Setting up subscriptions
- Updating the DOM
- Logging

## Source

[useEffect Guide](https://react.dev/reference/react/useEffect)
ENDOFFILE

# Test page 7
cat > ~/.para/projects/test-project/wiki/typescript-types.md << 'ENDOFFILE'
# TypeScript Types

TypeScript type system.

## Basic Types

```typescript
string, number, boolean, null, undefined
```

## Advanced Types

### Union Types

```typescript
type Result = "success" | "error";
```

### Intersection Types

```typescript
interface A { a: string; }
interface B { b: number; }
type C = A & B;
```

### Utility Types

```typescript
Partial<T>    // All properties optional
Required<T>    // All properties required
Pick<T, K>    // Select properties
Omit<T, K>    // Exclude properties
```

## Type Guards

```typescript
if (typeof value === "string") {
  // value is string here
}
```

## Source

[TypeScript Utility Types](https://www.typescriptlang.org/docs/handbook/utility-types.html)
ENDOFFILE

# Test page 8
cat > ~/.para/projects/test-project/wiki/typescript-generics.md << 'ENDOFFILE'
# TypeScript Generics

Generics provide type parameters.

## Generic Functions

```typescript
function identity<T>(arg: T): T {
  return arg;
}

identity<string>("hello"); // explicit
identity(123); // inferred
```

## Generic Interfaces

```typescript
interface Container<T> {
  value: T;
  getValue(): T;
}
```

## Constraints

```typescript
interface Lengthwise {
  length: number;
}

function logLength<T extends Lengthwise>(arg: T): number {
  return arg.length;
}
```

## Source

[TypeScript Generics](https://www.typescriptlang.org/docs/handbook/2/generics.html)
ENDOFFILE

# Test page 9
cat > ~/.para/projects/test-project/wiki/react-context.md << 'ENDOFFILE'
# React Context

Context provides a way to pass data without props.

## Creating Context

```javascript
const ThemeContext = React.createContext('light');
```

## Providing Value

```javascript
<ThemeContext.Provider value="dark">
  <App />
</ThemeContext.Provider>
```

## Consuming Context

```javascript
const theme = useContext(ThemeContext);
```

## When to Use

- Theme (dark/light mode)
- User authentication
- Language/locale
- Global settings

## Source

[React Context Documentation](https://react.dev/learn/passing-data-deeply-with-context)
ENDOFFILE

# Test page 10
cat > ~/.para/projects/test-project/wiki/react-advanced.md << 'ENDOFFILE'
# Advanced React Patterns

Advanced React patterns for enterprise apps.

## Higher Order Components (HOC)

```javascript
const withLoading = (Component) => {
  return ({ isLoading, ...props }) => {
    if (isLoading) return <Loading />;
    return <Component {...props} />;
  };
};
```

## Custom Hooks

```javascript
const useWindowSize = () => {
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  
  useEffect(() => {
    const handleResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return size;
};
```

## Render Props

```javascript
<MouseRenderProp
  render={mouse => (
    <Cat mouse={mouse} />
  )}
/>
```

## Source

[React Patterns](https://reactpatterns.com/)
ENDOFFILE

# Test page 11
cat > ~/.para/projects/test-project/wiki/react-hooks-advanced.md << 'ENDOFFILE'
# Advanced React Hooks

Custom hooks and advanced patterns.

## useCallback

Memoize functions:

```javascript
const memoizedCallback = useCallback(
  () => doSomething(a, b),
  [a, b]
);
```

## useMemo

Memoize values:

```javascript
const memoizedValue = useMemo(
  () => computeExpensiveValue(a, b),
  [a, b]
);
```

## useRef

Access DOM elements or store mutable values:

```javascript
const inputRef = useRef(null);

useEffect(() => {
  inputRef.current.focus();
}, []);

return <input ref={inputRef} />;
```

## Custom Hooks Pattern

```javascript
const useAsync = (asyncFunction) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    asyncFunction().then(setData).finally(() => setLoading(false));
  }, []);
  
  return { data, loading };
};
```

## Source

[React Hooks API](https://react.dev/reference/react)
ENDOFFILE

echo "✅ Created 11 improved wiki pages"

# Count pages
PAGE_COUNT=$(find ~/.para/projects/test-project/wiki -name "*.md" | wc -l)
echo "📄 Total wiki pages: $PAGE_COUNT"

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
echo "=========================================="
echo "Test Complete"
echo "=========================================="