import { execFileSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import https from "node:https";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import WebSocket from "ws";

const token = randomBytes(32).toString("hex");
const tokenProtocol = `blitz-token.${Buffer.from(token).toString("base64url")}`;
const port = randomInt(20_000, 40_000);
const bridgeUrl = `wss://127.0.0.1:${port}`;
const rootCertificate = readFileSync(
  join(execFileSync("mkcert", ["-CAROOT"], { encoding: "utf8" }).trim(), "rootCA.pem"),
);

const transport = new StdioClientTransport({
  command: "npm",
  args: ["run", "mcp:server"],
  cwd: process.cwd(),
  env: {
    ...process.env,
    BLITZ_BRIDGE_TOKEN: token,
    BLITZ_BRIDGE_ORIGINS: "http://127.0.0.1:5173",
    BLITZ_BRIDGE_PORT: String(port),
  },
  stderr: "inherit",
});
const client = new Client({ name: "blitz-bridge-test", version: "0.1.0" });
let canvas;

async function readBridgeStatus() {
  return new Promise((resolve, reject) => {
    https
      .get(
        `https://127.0.0.1:${port}/__blitz/status`,
        { ca: rootCertificate },
        (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch (error) {
              reject(error);
            }
          });
        },
      )
      .on("error", reject);
  });
}

try {
  await client.connect(transport);
  const initializedStatus = await readBridgeStatus();
  if (
    initializedStatus.server !== "running" ||
    initializedStatus.mcpClientConnected !== true ||
    initializedStatus.canvasConnected !== false
  ) {
    throw new Error(`Unexpected initialized bridge status: ${JSON.stringify(initializedStatus)}`);
  }

  const expectRejected = async (protocols, origin) => {
    const rejectedSocket = new WebSocket(bridgeUrl, protocols, {
      origin,
      ca: rootCertificate,
    });
    await new Promise((resolve, reject) => {
      rejectedSocket.once("unexpected-response", (_request, response) => {
        if (response.statusCode === 403) {
          resolve();
        } else {
          reject(new Error(`Expected HTTP 403, received ${response.statusCode}.`));
        }
      });
      rejectedSocket.once("open", () => reject(new Error("Unauthorized bridge connection opened.")));
      rejectedSocket.once("error", () => {
        // The status assertion is handled by unexpected-response.
      });
    });
  };

  await expectRejected(
    ["blitz-canvas", `blitz-token.${Buffer.from("wrong-token-value").toString("base64url")}`],
    "http://127.0.0.1:5173",
  );
  await expectRejected(["blitz-canvas", tokenProtocol], "https://malicious.example");

  canvas = new WebSocket(
    bridgeUrl,
    ["blitz-canvas", tokenProtocol],
    {
      origin: "http://127.0.0.1:5173",
      ca: rootCertificate,
    },
  );
  await new Promise((resolve, reject) => {
    canvas.once("open", resolve);
    canvas.once("error", reject);
  });
  const connectedStatus = await readBridgeStatus();
  if (
    connectedStatus.mcpClientConnected !== true ||
    connectedStatus.canvasConnected !== true
  ) {
    throw new Error(`Unexpected connected bridge status: ${JSON.stringify(connectedStatus)}`);
  }

  let entities = 10;
  let selected = 0;
  let receivedShapes = [];
  canvas.on("message", (data) => {
    const request = JSON.parse(data.toString());
    let result;
    if (request.method === "canvas.add_shapes") {
      receivedShapes = request.params.shapes;
      const added = request.params.shapes.length;
      entities += added;
      selected = added > 0 ? 1 : selected;
      result = {
        added,
        ids: Array.from(
          { length: added },
          (_value, index) => `0000000000000001:${(entities - added + index + 1)
            .toString(16)
            .padStart(16, "0")}`,
        ),
        entities,
        selected,
      };
    } else if (request.method === "canvas.update_objects") {
      result = {
        updated: request.params.updates.length,
        ids: request.params.updates.map((update) => update.id),
        entities,
        selected,
      };
    } else if (request.method === "canvas.measure_text") {
      result = {
        items: request.params.items.map((item) => ({
          ...item,
          width: item.text.length * item.fontSize * 0.5,
          height: item.fontSize * 1.36181641,
          ascender: item.fontSize * 1.06884766,
          descender: item.fontSize * -0.29296875,
          lineCount: item.maxWidth || item.box ? 2 : 1,
          lines: item.maxWidth || item.box
            ? [
                { text: item.text.split(" ")[0], width: item.maxWidth * 0.6 },
                { text: item.text.split(" ").slice(1).join(" "), width: item.maxWidth * 0.8 },
              ]
            : [{ text: item.text, width: item.text.length * item.fontSize * 0.5 }],
          overflow: false,
          supported: !item.text.includes("😀"),
          unsupportedGlyphs: item.text.includes("😀")
            ? [{ character: "😀", codepoint: 128512, hex: "U+1F600" }]
            : [],
        })),
      };
    } else if (request.method === "canvas.get_text_capabilities") {
      result = {
        glyphCount: 1008,
        replacementCodepoint: 65533,
        replacementCharacter: "�",
        unsupportedBehavior:
          "Unsupported Unicode code points render and measure as the replacement character.",
        ranges: [{ start: 32, end: 126, startHex: "U+0020", endHex: "U+007E" }],
      };
    } else if (request.method === "canvas.delete_selected") {
      const deleted = selected;
      entities -= deleted;
      selected = 0;
      result = { deleted, entities, selected };
    } else if (request.method === "canvas.get_state") {
      result = { entities, selected };
    } else if (request.method === "canvas.get_scene") {
      result = {
        bounds: request.params.bounds ?? { x: -600, y: -340, width: 1200, height: 680 },
        objects: [
          {
            id: 7,
            type: "rect",
            x: 20,
            y: 30,
            width: 240,
            height: 120,
            backgroundColor: "#3366CC80",
          },
        ],
        returned: 1,
        total: 1,
        truncated: false,
      };
    } else if (request.method === "canvas.find_empty_space") {
      result = {
        found: true,
        x: 320,
        y: 40,
        width: request.params.width,
        height: request.params.height,
        padding: request.params.padding,
      };
    } else {
      canvas.send(JSON.stringify({ id: request.id, ok: false, error: "Unsupported test method." }));
      return;
    }
    canvas.send(JSON.stringify({ id: request.id, ok: true, result }));
  });

  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name).sort();
  const expectedTools = [
    "canvas_add_shapes",
    "canvas_delete_selected",
    "canvas_find_empty_space",
    "canvas_get_scene",
    "canvas_get_state",
    "canvas_get_text_capabilities",
    "canvas_measure_text",
    "canvas_update_objects",
  ];
  if (JSON.stringify(toolNames) !== JSON.stringify(expectedTools)) {
    throw new Error(`Unexpected tools: ${toolNames.join(", ")}`);
  }

  const addResult = await client.callTool({
    name: "canvas_add_shapes",
    arguments: {
      shapes: [
        {
          type: "rect",
          x: 20,
          y: 30,
          width: 240,
          height: 120,
          backgroundColor: "#3366CC80",
          strokeColor: "#112233",
          strokeWidth: 4,
        },
        {
          type: "circle",
          x: 400,
          y: 240,
          radius: 64,
          backgroundColor: "#33CC99",
          strokeColor: "#075E54",
          strokeWidth: 2,
        },
        {
          type: "text",
          x: 80,
          y: 420,
          text: "Hello Blitz",
          fontSize: 48,
          color: "#F8FAFC",
        },
      ],
    },
  });
  const addText = addResult.content[0]?.type === "text" ? addResult.content[0].text : "";
  if (!addText.includes('"added":3') || !addText.includes('"entities":13')) {
    throw new Error(`Unexpected add result: ${addText}`);
  }
  if (
    receivedShapes[0]?.backgroundColor !== "#3366CC80" ||
    receivedShapes[0]?.strokeWidth !== 4 ||
    receivedShapes[1]?.radius !== 64 ||
    receivedShapes[2]?.text !== "Hello Blitz" ||
    receivedShapes[2]?.fontSize !== 48
  ) {
    throw new Error(`Shape parameters were not preserved: ${JSON.stringify(receivedShapes)}`);
  }

  const defaultResult = await client.callTool({
    name: "canvas_add_shapes",
    arguments: {
      shapes: [{ type: "triangle", x: -50, y: 15, width: 100, height: 80 }],
    },
  });
  if (defaultResult.isError) {
    throw new Error("Shape defaults should be accepted.");
  }
  if (
    receivedShapes[0]?.backgroundColor !== "#FFEBD9" ||
    receivedShapes[0]?.strokeColor !== "#E84F45" ||
    receivedShapes[0]?.strokeWidth !== 0
  ) {
    throw new Error(`Shape defaults were not applied: ${JSON.stringify(receivedShapes)}`);
  }

  const stateResult = await client.callTool({ name: "canvas_get_state", arguments: {} });
  const stateText = stateResult.content[0]?.type === "text" ? stateResult.content[0].text : "";
  if (!stateText.includes('"entities":14')) {
    throw new Error(`Unexpected state result: ${stateText}`);
  }

  const updateResult = await client.callTool({
    name: "canvas_update_objects",
    arguments: {
      updates: [
        {
          id: "0000000000000001:000000000000000b",
          type: "text",
          text: "Updated wrapped copy",
          maxWidth: 180,
          maxLines: 3,
        },
      ],
    },
  });
  const updateText =
    updateResult.content[0]?.type === "text" ? updateResult.content[0].text : "";
  if (
    !updateText.includes('"updated":1') ||
    !updateText.includes('"0000000000000001:000000000000000b"')
  ) {
    throw new Error(`Unexpected update result: ${updateText}`);
  }

  const measurementResult = await client.callTool({
    name: "canvas_measure_text",
    arguments: {
      items: [
        {
          text: "Connection path",
          fontSize: 28,
          box: {
            x: 100,
            y: 200,
            width: 200,
            height: 100,
            padding: 12,
            verticalAlign: "middle",
          },
        },
        { text: "Shared bridge token", fontSize: 18 },
      ],
    },
  });
  const measurementText =
    measurementResult.content[0]?.type === "text"
      ? measurementResult.content[0].text
      : "";
  if (
    !measurementText.includes('"text":"Connection path"') ||
    !measurementText.includes('"lineCount":2') ||
    !measurementText.includes('"fontSize":18')
  ) {
    throw new Error(`Unexpected text measurement result: ${measurementText}`);
  }

  const capabilityResult = await client.callTool({
    name: "canvas_get_text_capabilities",
    arguments: {},
  });
  const capabilityText =
    capabilityResult.content[0]?.type === "text" ? capabilityResult.content[0].text : "";
  if (
    !capabilityText.includes('"glyphCount":1008') ||
    !capabilityText.includes('"startHex":"U+0020"')
  ) {
    throw new Error(`Unexpected text capabilities result: ${capabilityText}`);
  }

  const sceneResult = await client.callTool({
    name: "canvas_get_scene",
    arguments: { bounds: { x: 0, y: 0, width: 800, height: 600 }, limit: 50 },
  });
  const sceneText = sceneResult.content[0]?.type === "text" ? sceneResult.content[0].text : "";
  if (!sceneText.includes('"type":"rect"') || !sceneText.includes('"truncated":false')) {
    throw new Error(`Unexpected scene result: ${sceneText}`);
  }

  const emptyResult = await client.callTool({
    name: "canvas_find_empty_space",
    arguments: { width: 200, height: 100, padding: 32 },
  });
  const emptyText = emptyResult.content[0]?.type === "text" ? emptyResult.content[0].text : "";
  if (!emptyText.includes('"found":true') || !emptyText.includes('"padding":32')) {
    throw new Error(`Unexpected empty-space result: ${emptyText}`);
  }

  console.log("Secure MCP bridge integration test passed.");
} finally {
  canvas?.close();
  await client.close();
}
