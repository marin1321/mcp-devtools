import { defineConfig } from "vitepress";

export default defineConfig({
  title: "mcp-devtools",
  description: "AI-native developer tools via Model Context Protocol",
  head: [["link", { rel: "icon", type: "image/svg+xml", href: "/logo.svg" }]],
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Tools", link: "/tools/filesystem" },
      { text: "MCP Primitives", link: "/mcp-primitives/resources" },
      {
        text: "v1.0.0",
        items: [
          {
            text: "Changelog",
            link: "https://github.com/marin1321/mcp-devtools/blob/main/CHANGELOG.md",
          },
          { text: "npm", link: "https://www.npmjs.com/package/@oscarmarin/mcp-devtools" },
        ],
      },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Configuration", link: "/guide/configuration" },
          { text: "Plugins", link: "/guide/plugins" },
          { text: "Security", link: "/guide/security" },
        ],
      },
      {
        text: "Tools",
        items: [
          { text: "Filesystem", link: "/tools/filesystem" },
          { text: "Database", link: "/tools/database" },
          { text: "Process", link: "/tools/process" },
          { text: "OpenAPI", link: "/tools/openapi" },
        ],
      },
      {
        text: "MCP Primitives",
        items: [
          { text: "Resources", link: "/mcp-primitives/resources" },
          { text: "Prompts", link: "/mcp-primitives/prompts" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/marin1321/mcp-devtools" },
      { icon: "npm", link: "https://www.npmjs.com/package/@oscarmarin/mcp-devtools" },
    ],
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 Oscar Humberto Marin Molina",
    },
    search: {
      provider: "local",
    },
  },
});
