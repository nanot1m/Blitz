import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import { PNG } from "pngjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = resolve(root, "src/assets/OpenSans-Regular.ttf");
const atlasOutput = resolve(root, "public/font-atlas.png");
const headerOutput = resolve(root, "src/wasm/font.generated.h");
const firstCodepoint = 32;
const lastCodepoint = 126;
const fontSize = 64;
const atlasSize = 1024;
const padding = 8;
const spread = 6;

const font = opentype.parse(readFileSync(input).buffer);

function flattenPath(path) {
  const contours = [];
  let contour = [];
  let current = { x: 0, y: 0 };

  const pushPoint = (x, y) => {
    const previous = contour[contour.length - 1];
    if (!previous || previous.x !== x || previous.y !== y) {
      contour.push({ x, y });
    }
    current = { x, y };
  };

  const finishContour = () => {
    if (contour.length > 1) {
      contours.push(contour);
    }
    contour = [];
  };

  for (const command of path.commands) {
    if (command.type === "M") {
      finishContour();
      pushPoint(command.x, command.y);
    } else if (command.type === "L") {
      pushPoint(command.x, command.y);
    } else if (command.type === "Q") {
      const start = current;
      for (let step = 1; step <= 12; step += 1) {
        const t = step / 12;
        const inverse = 1 - t;
        pushPoint(
          inverse * inverse * start.x + 2 * inverse * t * command.x1 + t * t * command.x,
          inverse * inverse * start.y + 2 * inverse * t * command.y1 + t * t * command.y,
        );
      }
    } else if (command.type === "C") {
      const start = current;
      for (let step = 1; step <= 16; step += 1) {
        const t = step / 16;
        const inverse = 1 - t;
        pushPoint(
          inverse ** 3 * start.x +
            3 * inverse * inverse * t * command.x1 +
            3 * inverse * t * t * command.x2 +
            t ** 3 * command.x,
          inverse ** 3 * start.y +
            3 * inverse * inverse * t * command.y1 +
            3 * inverse * t * t * command.y2 +
            t ** 3 * command.y,
        );
      }
    } else if (command.type === "Z") {
      finishContour();
    }
  }
  finishContour();
  return contours;
}

function pointInside(contours, x, y) {
  let winding = 0;
  for (const contour of contours) {
    for (let index = 0; index < contour.length; index += 1) {
      const start = contour[index];
      const end = contour[(index + 1) % contour.length];
      if (start.y <= y) {
        if (end.y > y && (end.x - start.x) * (y - start.y) - (x - start.x) * (end.y - start.y) > 0) {
          winding += 1;
        }
      } else if (
        end.y <= y &&
        (end.x - start.x) * (y - start.y) - (x - start.x) * (end.y - start.y) < 0
      ) {
        winding -= 1;
      }
    }
  }
  return winding !== 0;
}

function segmentDistanceSquared(segment, x, y) {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSquared = dx * dx + dy * dy;
  const projection =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((x - segment.start.x) * dx + (y - segment.start.y) * dy) / lengthSquared));
  const offsetX = x - (segment.start.x + projection * dx);
  const offsetY = y - (segment.start.y + projection * dy);
  return offsetX * offsetX + offsetY * offsetY;
}

function isCorner(previous, current, next) {
  const incomingX = current.x - previous.x;
  const incomingY = current.y - previous.y;
  const outgoingX = next.x - current.x;
  const outgoingY = next.y - current.y;
  const incomingLength = Math.hypot(incomingX, incomingY);
  const outgoingLength = Math.hypot(outgoingX, outgoingY);
  if (incomingLength === 0 || outgoingLength === 0) {
    return false;
  }
  const cosine =
    (incomingX * outgoingX + incomingY * outgoingY) / (incomingLength * outgoingLength);
  return cosine < 0.9;
}

function colorContour(contour) {
  const cornerIndices = [];
  for (let index = 0; index < contour.length; index += 1) {
    const previous = contour[(index + contour.length - 1) % contour.length];
    const current = contour[index];
    const next = contour[(index + 1) % contour.length];
    if (isCorner(previous, current, next)) {
      cornerIndices.push(index);
    }
  }

  const colorMasks = [0b110, 0b101, 0b011];
  const segments = [];
  for (let index = 0; index < contour.length; index += 1) {
    let colorIndex;
    if (cornerIndices.length >= 3) {
      let span = 0;
      for (let corner = 0; corner < cornerIndices.length; corner += 1) {
        if (cornerIndices[corner] <= index) {
          span = corner;
        }
      }
      colorIndex = span % colorMasks.length;
    } else {
      colorIndex = Math.min(
        colorMasks.length - 1,
        Math.floor((index * colorMasks.length) / contour.length),
      );
    }
    segments.push({
      start: contour[index],
      end: contour[(index + 1) % contour.length],
      colorMask: colorMasks[colorIndex],
    });
  }
  return segments;
}

function generateMsdfSample(segments, contours, x, y) {
  const channelDistanceSquared = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];

  for (const segment of segments) {
    const distanceSquared = segmentDistanceSquared(segment, x, y);
    for (let channel = 0; channel < 3; channel += 1) {
      if ((segment.colorMask & (1 << channel)) !== 0) {
        channelDistanceSquared[channel] = Math.min(channelDistanceSquared[channel], distanceSquared);
      }
    }
  }

  const sign = pointInside(contours, x, y) ? 1 : -1;
  return channelDistanceSquared.map((distanceSquared) => sign * Math.sqrt(distanceSquared));
}

const glyphs = [];
for (let codepoint = firstCodepoint; codepoint <= lastCodepoint; codepoint += 1) {
  const glyph = font.charToGlyph(String.fromCodePoint(codepoint));
  const path = glyph.getPath(0, 0, fontSize);
  const bounds = path.getBoundingBox();
  const hasOutline = path.commands.length > 0 && Number.isFinite(bounds.x1);
  const left = hasOutline ? Math.floor(bounds.x1) - padding : 0;
  const top = hasOutline ? Math.floor(bounds.y1) - padding : 0;
  const right = hasOutline ? Math.ceil(bounds.x2) + padding : 1;
  const bottom = hasOutline ? Math.ceil(bounds.y2) + padding : 1;
  glyphs.push({
    codepoint,
    advance: (glyph.advanceWidth ?? font.unitsPerEm) / font.unitsPerEm,
    left,
    top,
    width: right - left,
    height: bottom - top,
    contours: hasOutline ? flattenPath(path) : [],
  });
  glyphs[glyphs.length - 1].segments = glyphs[glyphs.length - 1].contours.flatMap(colorContour);
}

let cursorX = 0;
let cursorY = 0;
let rowHeight = 0;
for (const glyph of glyphs) {
  if (cursorX + glyph.width > atlasSize) {
    cursorX = 0;
    cursorY += rowHeight;
    rowHeight = 0;
  }
  if (cursorY + glyph.height > atlasSize) {
    throw new Error(`Font atlas overflowed ${atlasSize}x${atlasSize}.`);
  }
  glyph.atlasX = cursorX;
  glyph.atlasY = cursorY;
  cursorX += glyph.width;
  rowHeight = Math.max(rowHeight, glyph.height);
}

const png = new PNG({ width: atlasSize, height: atlasSize, colorType: 6 });
png.data.fill(0);
for (let offset = 3; offset < png.data.length; offset += 4) {
  png.data[offset] = 255;
}
for (const glyph of glyphs) {
  if (glyph.contours.length === 0) {
    continue;
  }
  for (let y = 0; y < glyph.height; y += 1) {
    for (let x = 0; x < glyph.width; x += 1) {
      const sampleX = glyph.left + x + 0.5;
      const sampleY = glyph.top + y + 0.5;
      const sample = generateMsdfSample(glyph.segments, glyph.contours, sampleX, sampleY);
      const values = sample.map((distance) =>
        Math.round(Math.max(0, Math.min(1, 0.5 + distance / spread)) * 255),
      );
      const offset = ((glyph.atlasY + y) * atlasSize + glyph.atlasX + x) * 4;
      png.data[offset] = values[0];
      png.data[offset + 1] = values[1];
      png.data[offset + 2] = values[2];
      png.data[offset + 3] = 255;
    }
  }
}

const floatLiteral = (value) => {
  const text = String(Number(value.toFixed(8)));
  return `${text.includes(".") || text.includes("e") ? text : `${text}.0`}f`;
};
const metrics = glyphs
  .map(
    (glyph) =>
      `  {${floatLiteral(glyph.advance)}, ${floatLiteral(glyph.left / fontSize)}, ` +
      `${floatLiteral(glyph.top / fontSize)}, ${floatLiteral(glyph.width / fontSize)}, ` +
      `${floatLiteral(glyph.height / fontSize)}, ${floatLiteral(glyph.atlasX / atlasSize)}, ` +
      `${floatLiteral(glyph.atlasY / atlasSize)}, ${floatLiteral((glyph.atlasX + glyph.width) / atlasSize)}, ` +
      `${floatLiteral((glyph.atlasY + glyph.height) / atlasSize)}},`,
  )
  .join("\n");

const header = `/* Generated by scripts/compile-font.mjs. */
#ifndef BLITZ_FONT_GENERATED_H
#define BLITZ_FONT_GENERATED_H

#define BLITZ_FONT_FIRST_CODEPOINT ${firstCodepoint}u
#define BLITZ_FONT_LAST_CODEPOINT ${lastCodepoint}u
#define BLITZ_FONT_ATLAS_SIZE ${atlasSize}.0f
#define BLITZ_FONT_MSDF_SPREAD ${spread}.0f
#define BLITZ_FONT_ASCENDER ${floatLiteral(font.ascender / font.unitsPerEm)}
#define BLITZ_FONT_DESCENDER ${floatLiteral(font.descender / font.unitsPerEm)}
#define BLITZ_FONT_LINE_HEIGHT ${floatLiteral((font.ascender - font.descender) / font.unitsPerEm)}

typedef struct FontGlyphMetric {
  float advance;
  float plane_left;
  float plane_top;
  float plane_width;
  float plane_height;
  float uv_left;
  float uv_top;
  float uv_right;
  float uv_bottom;
} FontGlyphMetric;

static const FontGlyphMetric blitz_font_glyphs[] = {
${metrics}
};

#endif
`;

mkdirSync(dirname(atlasOutput), { recursive: true });
mkdirSync(dirname(headerOutput), { recursive: true });
writeFileSync(atlasOutput, PNG.sync.write(png));
writeFileSync(headerOutput, header);
console.log(`Wrote ${atlasOutput}`);
console.log(`Wrote ${headerOutput}`);
