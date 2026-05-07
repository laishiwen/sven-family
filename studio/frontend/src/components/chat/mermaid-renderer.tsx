import { useEffect, useRef, useState } from "react";

interface MermaidRendererProps {
  code: string;
  className?: string;
}

export function MermaidRenderer({ code, className = "" }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        // Dynamic import to avoid bundling mermaid in main bundle
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "loose",
        });
        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
        const { svg: rendered } = await mermaid.render(id, code);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to render diagram");
          setSvg("");
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <div className={`my-2 rounded-lg border border-red-200 bg-red-50 p-3 ${className}`}>
        <div className="text-xs font-medium text-red-600 mb-1">Mermaid render error</div>
        <pre className="text-xs text-red-500 overflow-x-auto">{error}</pre>
        <pre className="mt-1 text-xs text-muted-foreground overflow-x-auto">{code}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className={`my-2 rounded-lg border bg-muted p-4 text-center text-sm text-muted-foreground ${className}`}>
        Rendering diagram...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`my-2 flex justify-center overflow-x-auto rounded-lg border bg-white p-4 ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
