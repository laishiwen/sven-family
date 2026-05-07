export interface MockTopic {
  id: string;
  title: string;
  content: string;
  tags: string[];
  author_name: string;
  author_initials: string;
  likes_count: number;
  comments_count: number;
  created_at: string;
  comments: MockComment[];
}

export interface MockComment {
  id: string;
  author_name: string;
  author_initials: string;
  content: string;
  created_at: string;
}

const now = Date.now();
const d = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();
const h = (hoursAgo: number) => new Date(now - hoursAgo * 3600000).toISOString();

export const mockTopics: MockTopic[] = [
  {
    id: "1",
    title: "Building a RAG pipeline with LangChain and local embeddings",
    content:
      "I've been experimenting with a fully local RAG setup using LangChain, ChromaDB, and Ollama...",
    tags: ["rag", "langchain", "tutorial"],
    author_name: "Alice Chen",
    author_initials: "AC",
    likes_count: 34,
    comments_count: 8,
    created_at: d(1),
    comments: [
      {
        id: "c1",
        author_name: "Bob Zhang",
        author_initials: "BZ",
        content:
          "Have you tried using Qdrant instead of ChromaDB? I found it much faster for larger datasets.",
        created_at: d(1),
      },
      {
        id: "c2",
        author_name: "Alice Chen",
        author_initials: "AC",
        content:
          "Not yet! I'll give it a try this weekend. Do you have any benchmark comparisons?",
        created_at: h(20),
      },
    ],
  },
  {
    id: "2",
    title: "Share your best agent system prompts",
    content:
      "I've collected a few system prompts that work really well for coding agents.",
    tags: ["agents", "prompts", "discussion"],
    author_name: "Mike Liu",
    author_initials: "ML",
    likes_count: 56,
    comments_count: 23,
    created_at: d(2),
    comments: [
      {
        id: "c3",
        author_name: "Sarah Wang",
        author_initials: "SW",
        content:
          "Here's one I use for code review:\n\n```\nYou are a senior engineer reviewing code.\n```",
        created_at: d(2),
      },
      {
        id: "c4",
        author_name: "Mike Liu",
        author_initials: "ML",
        content: "That's clean and effective. I'll add it to my rotation.",
        created_at: d(1),
      },
      {
        id: "c5",
        author_name: "David Kim",
        author_initials: "DK",
        content:
          "I prefer a more structured approach with specific review criteria.",
        created_at: h(12),
      },
    ],
  },
  {
    id: "3",
    title: "Introducing my new MCP server for Notion integration",
    content:
      "I built an MCP server that lets Claude read and write to Notion databases. Works with pages, databases, and blocks.",
    tags: ["mcp", "showcase", "tools"],
    author_name: "Emily Park",
    author_initials: "EP",
    likes_count: 42,
    comments_count: 12,
    created_at: d(3),
    comments: [
      {
        id: "c6",
        author_name: "Tom Lee",
        author_initials: "TL",
        content: "This is exactly what I needed! Starred.",
        created_at: d(2),
      },
    ],
  },
  {
    id: "4",
    title: "Best practices for fine-tuning open-source models on consumer GPUs",
    content:
      "After weeks of experimenting with LoRA and QLoRA, here's what I learned about getting good results with limited VRAM.",
    tags: ["finetune", "guide", "gpu"],
    author_name: "Ryan Wu",
    author_initials: "RW",
    likes_count: 89,
    comments_count: 31,
    created_at: d(4),
    comments: [
      {
        id: "c7",
        author_name: "Lisa Zhao",
        author_initials: "LZ",
        content:
          "The QLoRA section was super helpful. Got 4x speedup with your 4-bit quantization tips.",
        created_at: d(3),
      },
      {
        id: "c8",
        author_name: "Ryan Wu",
        author_initials: "RW",
        content:
          "Glad it helped! Try the NF4 data type on 4090 for even better results.",
        created_at: d(3),
      },
    ],
  },
  {
    id: "5",
    title: "Community skill: browser automation with Playwright",
    content:
      "I published a new community skill that adds Playwright-powered browser automation to your agents.",
    tags: ["skills", "playwright", "automation"],
    author_name: "Jack Brown",
    author_initials: "JB",
    likes_count: 27,
    comments_count: 5,
    created_at: d(5),
    comments: [],
  },
  {
    id: "6",
    title: "How do you handle long-running agent tasks?",
    content:
      "I'm building an agent that sometimes runs for 20+ minutes. How do you handle timeouts, progress updates, and resumability?",
    tags: ["agents", "architecture", "question"],
    author_name: "Nina Patel",
    author_initials: "NP",
    likes_count: 18,
    comments_count: 15,
    created_at: d(6),
    comments: [
      {
        id: "c9",
        author_name: "Oscar Martinez",
        author_initials: "OM",
        content: "Check out Temporal.io — it's built exactly for this.",
        created_at: d(5),
      },
    ],
  },
  {
    id: "7",
    title: "Local LLM benchmark results: January edition",
    content:
      "Ran benchmarks on 15 popular models across reasoning, coding, and creative tasks. Some surprising results.",
    tags: ["llm", "benchmark", "data"],
    author_name: "Chris Yang",
    author_initials: "CY",
    likes_count: 103,
    comments_count: 47,
    created_at: d(7),
    comments: [],
  },
];

export const mockTags = [
  { name: "rag", count: 12 },
  { name: "agents", count: 28 },
  { name: "mcp", count: 15 },
  { name: "llm", count: 23 },
  { name: "tools", count: 19 },
  { name: "skills", count: 14 },
  { name: "tutorial", count: 8 },
  { name: "discussion", count: 31 },
  { name: "showcase", count: 17 },
];
