/**
 * Skills module entry point.
 *
 * Importing this file registers all built-in skills into the global skillRegistry.
 * Import it once at startup (e.g. in server.ts) before any worker starts.
 */

// Register built-in skills by importing their side-effect modules
import "./builtin/order.skill.js";
import "./builtin/logistics.skill.js";
import "./builtin/knowledge_base.skill.js";
import "./builtin/crm.skill.js";

export { skillRegistry } from "./skill.registry.js";
