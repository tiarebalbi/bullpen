// Ambient module for CSS side-effect imports (e.g. "@xyflow/react/dist/style.css"
// in ArchitectureExplorer.tsx). The actual import is handled by whichever
// bundler a consumer uses (Next's webpack in apps/landing); this just lets
// this package's own standalone `tsc --noEmit` typecheck the import statement.
declare module "*.css";
