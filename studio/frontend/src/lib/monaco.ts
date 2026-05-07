import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

// Force Monaco to use the bundled runtime instead of loading from CDN.
loader.config({ monaco });
