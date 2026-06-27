import { readFile } from "node:fs/promises";

const bytes = await readFile("public/blitz.wasm");
const { instance } = await WebAssembly.instantiate(bytes, {});
const wasm = instance.exports as Record<string, CallableFunction> & {
  memory: WebAssembly.Memory;
};

wasm.blitz_init();
wasm.blitz_set_actor_id(0x12345678, 0x9abcdef0);

const readObjectId = (offset: number): number[] => {
  const view = new DataView(wasm.memory.buffer);
  return [0, 4, 8, 12].map((wordOffset) => view.getUint32(offset + wordOffset, true));
};

const objectIdEquals = (left: number[], right: number[]) =>
  left.every((word, index) => word === right[index]);

const readLastCreatedObjectId = () => readObjectId(wasm.blitz_last_created_object_id_ptr());
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const writeTextInput = (value: string) => {
  const bytes = textEncoder.encode(value);
  new Uint8Array(wasm.memory.buffer, wasm.blitz_text_input_ptr(), bytes.byteLength).set(bytes);
  return bytes.byteLength;
};

const readText = (ptr: number, length: number) =>
  textDecoder.decode(new Uint8Array(wasm.memory.buffer, ptr, length));

const querySceneItemByObjectId = (objectId: number[]) => {
  wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 100);
  const ptr = wasm.blitz_scene_query_ptr();
  const itemBytes = wasm.blitz_scene_query_item_bytes();
  const count = wasm.blitz_scene_query_count();
  const view = new DataView(wasm.memory.buffer);
  for (let index = 0; index < count; index += 1) {
    const offset = ptr + index * itemBytes;
    if (objectIdEquals(readObjectId(offset), objectId)) {
      return {
        kind: view.getUint32(offset + 16, true),
        order: view.getUint32(offset + 20, true),
        x: view.getFloat32(offset + 40, true),
        y: view.getFloat32(offset + 44, true),
        width: view.getFloat32(offset + 48, true),
        height: view.getFloat32(offset + 52, true),
      };
    }
  }
  throw new Error(`Object ${objectId.join(":")} was not found in the scene query.`);
};

const querySceneItems = () => {
  wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 100);
  const ptr = wasm.blitz_scene_query_ptr();
  const itemBytes = wasm.blitz_scene_query_item_bytes();
  const count = wasm.blitz_scene_query_count();
  const view = new DataView(wasm.memory.buffer);
  return Array.from({ length: count }, (_value, index) => {
    const offset = ptr + index * itemBytes;
    return {
      objectId: readObjectId(offset),
      kind: view.getUint32(offset + 16, true),
      order: view.getUint32(offset + 20, true),
      selected: view.getUint32(offset + 24, true) !== 0,
      selectedSubtree: view.getUint32(offset + 132, true) !== 0,
      x: view.getFloat32(offset + 40, true),
      y: view.getFloat32(offset + 44, true),
      width: view.getFloat32(offset + 48, true),
      height: view.getFloat32(offset + 52, true),
    };
  });
};

const queriedObjectIdAt = (index: number) => {
  const ptr = wasm.blitz_scene_query_ptr();
  const itemBytes = wasm.blitz_scene_query_item_bytes();
  if (index < 0 || index >= wasm.blitz_scene_query_count()) {
    throw new Error(`Scene query index ${index} is out of range.`);
  }
  return readObjectId(ptr + index * itemBytes);
};

const expectNear = (actual: number, expected: number, label: string) => {
  if (Math.abs(actual - expected) > 0.001) {
    throw new Error(`${label}: expected ${expected}, received ${actual}.`);
  }
};

const updateRectPosition = (objectId: number[], x: number, y: number, kind = 0) =>
  wasm.blitz_update_object(
    ...objectId,
    kind,
    1 | 2,
    x,
    y,
    1,
    1,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
  );

const shapeCommandForEntity = (entity: number) => {
  const ptr = wasm.blitz_shape_command_ptr();
  const count = wasm.blitz_shape_command_count();
  const wordsPerCommand = wasm.blitz_shape_command_u32_count();
  const view = new DataView(wasm.memory.buffer);
  for (let index = 0; index < count; index += 1) {
    const offset = ptr + index * wordsPerCommand * 4;
    if (view.getUint32(offset + 8, true) === entity) {
      return {
        shapeKind: view.getUint32(offset, true),
        order: view.getUint32(offset + 12, true),
      };
    }
  }
  throw new Error(`Shape command for entity ${entity} was not found.`);
};

if (wasm.blitz_entity_count() !== 0) {
  throw new Error("A newly initialized scene should be empty.");
}

wasm.blitz_resize(1000, 1000);

wasm.blitz_clear_scene();
wasm.blitz_load_demo_template();
if (wasm.blitz_entity_count() === 0) {
  throw new Error("The demo template did not create any objects.");
}

wasm.blitz_clear_scene();
wasm.blitz_resize(1000, 1000);
wasm.blitz_set_camera(0, 0, 1);
wasm.blitz_create_rect(-100, -50, 200, 100, 0.2, 0.4, 0.8, 1, 0.1, 0.2, 0.3, 1, 2);
if (wasm.blitz_selected_style_kind() !== 1) {
  throw new Error("A selected rectangle did not expose geometric styles.");
}
wasm.blitz_set_selected_fill(0.9, 0.1, 0.2);
wasm.blitz_set_selected_fill_opacity(0.4);
wasm.blitz_set_selected_stroke(0.2, 0.8, 0.3);
wasm.blitz_set_selected_stroke_opacity(0.65);
wasm.blitz_set_selected_stroke_width(6);
const selectedStyle = new Float32Array(
  wasm.memory.buffer,
  wasm.blitz_selected_style_ptr(),
  wasm.blitz_selected_style_f32_count(),
);
if (
  Math.abs(selectedStyle[0] - 0.9) > 0.001 ||
  Math.abs(selectedStyle[3] - 0.4) > 0.001 ||
  Math.abs(selectedStyle[5] - 0.8) > 0.001 ||
  Math.abs(selectedStyle[7] - 0.65) > 0.001 ||
  Math.abs(selectedStyle[8] - 6) > 0.001
) {
  throw new Error("Selected shape style updates were not written to ECS components.");
}
if (wasm.blitz_pointer_down(400, 450, 0) !== 3) {
  throw new Error("The rectangle northwest resize handle was not detected.");
}
wasm.blitz_pointer_move(380, 430);
wasm.blitz_pointer_up();
wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 1);
const resizedItem = new DataView(
  wasm.memory.buffer,
  wasm.blitz_scene_query_ptr(),
  wasm.blitz_scene_query_item_bytes(),
);
if (
  Math.abs(resizedItem.getFloat32(40, true) + 120) > 0.001 ||
  Math.abs(resizedItem.getFloat32(44, true) + 70) > 0.001 ||
  Math.abs(resizedItem.getFloat32(48, true) - 220) > 0.001 ||
  Math.abs(resizedItem.getFloat32(52, true) - 120) > 0.001
) {
  throw new Error("Rectangle resize did not update ECS position and size.");
}
if (wasm.blitz_resize_mode_at(600, 490) !== 8) {
  throw new Error("The rectangle east edge did not expose an east-west resize cursor.");
}
if (wasm.blitz_pointer_down(600, 490, 0) !== 8) {
  throw new Error("The rectangle east edge resize handle was not detected.");
}
wasm.blitz_pointer_move(630, 490);
wasm.blitz_pointer_up();
wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 1);
if (Math.abs(resizedItem.getFloat32(48, true) - 250) > 0.001) {
  throw new Error("Rectangle edge resize did not update its width.");
}

wasm.blitz_clear_scene();
wasm.blitz_resize(1000, 1000);
wasm.blitz_set_camera(0, 0, 1);
let frameTitleLength = writeTextInput("Roadmap");
wasm.blitz_create_frame(
  -120,
  -80,
  240,
  160,
  1,
  1,
  1,
  1,
  0.1,
  0.2,
  0.3,
  1,
  2,
  0.08,
  0.1,
  0.13,
  1,
  22,
  frameTitleLength,
);
if (wasm.blitz_selected_style_kind() !== 3) {
  throw new Error("A selected frame did not expose both geometric and title text styles.");
}
if (wasm.blitz_selected_container_state() !== 2) {
  throw new Error("A frame should always be tagged as a container.");
}
if (wasm.blitz_set_selected_container(0) !== 0 || wasm.blitz_selected_container_state() !== 2) {
  throw new Error("A frame allowed its required container component to be removed.");
}
wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 1);
const frameItem = new DataView(
  wasm.memory.buffer,
  wasm.blitz_scene_query_ptr(),
  wasm.blitz_scene_query_item_bytes(),
);
if (frameItem.getUint32(16, true) !== 4) {
  throw new Error("A frame was not exposed as the frame shape kind.");
}
if (
  readText(frameItem.getUint32(28, true), frameItem.getUint32(32, true)) !==
  "Roadmap"
) {
  throw new Error("A frame title was not exposed in scene query results.");
}
if (Math.abs(frameItem.getFloat32(92, true) - 22) > 0.001) {
  throw new Error("A frame title font size was not exposed in scene query results.");
}
frameTitleLength = writeTextInput("Updated");
wasm.blitz_set_selected_frame_title(frameTitleLength);
const frameTitlePtr = wasm.blitz_selected_frame_title_ptr();
if (
  readText(frameTitlePtr, wasm.blitz_selected_frame_title_length()) !==
  "Updated"
) {
  throw new Error("Frame title updates were not written to the selected frame.");
}
wasm.blitz_set_selected_text_font_size(30);
const frameStyle = new Float32Array(
  wasm.memory.buffer,
  wasm.blitz_selected_style_ptr(),
  wasm.blitz_selected_style_f32_count(),
);
if (Math.abs(frameStyle[14] - 30) > 0.001) {
  throw new Error("Frame title font size updates were not written to the frame.");
}

wasm.blitz_clear_scene();
wasm.blitz_resize(1000, 1000);
wasm.blitz_set_camera(0, 0, 1);
wasm.blitz_create_rect(0, 0, 200, 200, 0.8, 0.8, 1, 1, 0, 0, 0, 1, 1);
const containerId = readLastCreatedObjectId();
if (wasm.blitz_set_container(...containerId, 1) !== 1) {
  throw new Error("Failed to tag a rectangle as a container.");
}
wasm.blitz_create_rect(300, 0, 50, 50, 1, 0.8, 0.8, 1, 0, 0, 0, 1, 1);
const childId = readLastCreatedObjectId();
wasm.blitz_pointer_down(825, 525, 0);
wasm.blitz_pointer_move(600, 600);
wasm.blitz_pointer_up();
let childItem = querySceneItemByObjectId(childId);
expectNear(childItem.x, 75, "Dropped child x");
expectNear(childItem.y, 75, "Dropped child y");
if (updateRectPosition(containerId, 20, 30) !== 0) {
  throw new Error("Failed to move a container rectangle.");
}
childItem = querySceneItemByObjectId(childId);
expectNear(childItem.x, 95, "Relative child x after container move");
expectNear(childItem.y, 105, "Relative child y after container move");
wasm.blitz_select_object(childId[0], childId[1], childId[2], childId[3], 0);
wasm.blitz_send_to_back();
const containerAfterSendBack = querySceneItemByObjectId(containerId);
childItem = querySceneItemByObjectId(childId);
if (childItem.order <= containerAfterSendBack.order) {
  throw new Error("A relative child was allowed to move behind its parent container.");
}
wasm.blitz_select_object(containerId[0], containerId[1], containerId[2], containerId[3], 0);
wasm.blitz_pointer_down(560, 560, 0);
wasm.blitz_pointer_move(580, 580);
const parentDragCommand = shapeCommandForEntity(0);
const childDragCommand = shapeCommandForEntity(1);
if ((parentDragCommand.order & 0x80000000) === 0 || (childDragCommand.order & 0x80000000) === 0) {
  wasm.blitz_pointer_up();
  throw new Error("Dragging a container did not mark its child for live drag rendering.");
}
wasm.blitz_pointer_up();
if (updateRectPosition(containerId, 20, 30) !== 0) {
  throw new Error("Failed to reset a container after live drag verification.");
}
wasm.blitz_pointer_down(620, 630, 0);
wasm.blitz_pointer_move(900, 900);
wasm.blitz_pointer_up();
childItem = querySceneItemByObjectId(childId);
expectNear(childItem.x, 375, "Detached child x");
expectNear(childItem.y, 375, "Detached child y");
if (updateRectPosition(containerId, 0, 0) !== 0) {
  throw new Error("Failed to move a detached child's former container.");
}
childItem = querySceneItemByObjectId(childId);
expectNear(childItem.x, 375, "Detached child stable x");
expectNear(childItem.y, 375, "Detached child stable y");

wasm.blitz_clear_scene();
wasm.blitz_resize(1000, 1000);
wasm.blitz_set_camera(0, 0, 1);
wasm.blitz_create_rect(0, 0, 200, 200, 0.8, 0.8, 1, 1, 0, 0, 0, 1, 1);
const multiDropContainerId = readLastCreatedObjectId();
if (wasm.blitz_set_container(...multiDropContainerId, 1) !== 1) {
  throw new Error("Failed to tag the multi-drop target as a container.");
}
wasm.blitz_create_rect(300, 0, 50, 50, 1, 0.8, 0.8, 1, 0, 0, 0, 1, 1);
const multiDropFirstId = readLastCreatedObjectId();
wasm.blitz_create_rect(360, 0, 50, 50, 1, 0.9, 0.8, 1, 0, 0, 0, 1, 1);
const multiDropSecondId = readLastCreatedObjectId();
wasm.blitz_select_object(
  multiDropFirstId[0],
  multiDropFirstId[1],
  multiDropFirstId[2],
  multiDropFirstId[3],
  0,
);
wasm.blitz_select_object(
  multiDropSecondId[0],
  multiDropSecondId[1],
  multiDropSecondId[2],
  multiDropSecondId[3],
  1,
);
wasm.blitz_pointer_down(825, 525, 0);
wasm.blitz_pointer_move(550, 550);
wasm.blitz_pointer_up();
let multiDropFirst = querySceneItemByObjectId(multiDropFirstId);
let multiDropSecond = querySceneItemByObjectId(multiDropSecondId);
expectNear(multiDropFirst.x, 25, "Multi-drop first x");
expectNear(multiDropFirst.y, 25, "Multi-drop first y");
expectNear(multiDropSecond.x, 85, "Multi-drop second x");
expectNear(multiDropSecond.y, 25, "Multi-drop second y");
if (updateRectPosition(multiDropContainerId, 20, 30) !== 0) {
  throw new Error("Failed to move the multi-drop container.");
}
multiDropFirst = querySceneItemByObjectId(multiDropFirstId);
multiDropSecond = querySceneItemByObjectId(multiDropSecondId);
expectNear(multiDropFirst.x, 45, "Multi-drop attached first x");
expectNear(multiDropFirst.y, 55, "Multi-drop attached first y");
expectNear(multiDropSecond.x, 105, "Multi-drop attached second x");
expectNear(multiDropSecond.y, 55, "Multi-drop attached second y");

wasm.blitz_clear_scene();
wasm.blitz_create_rect(0, 0, 120, 100, 0.9, 0.9, 1, 1, 0, 0, 0, 1, 1);
const duplicateContainerId = readLastCreatedObjectId();
if (wasm.blitz_set_container(...duplicateContainerId, 1) !== 1) {
  throw new Error("Failed to tag duplicate source as a container.");
}
wasm.blitz_create_rect(20, 20, 30, 30, 1, 0.8, 0.8, 1, 0, 0, 0, 1, 1);
const duplicateChildId = readLastCreatedObjectId();
if (wasm.blitz_set_relative_transform(...duplicateChildId, ...duplicateContainerId, 20, 20) !== 1) {
  throw new Error("Failed to attach duplicate source child.");
}
wasm.blitz_select_object(
  duplicateContainerId[0],
  duplicateContainerId[1],
  duplicateContainerId[2],
  duplicateContainerId[3],
  0,
);
if (wasm.blitz_duplicate_selected(200, 0) !== 2) {
  throw new Error("Duplicating a selected container did not duplicate its child.");
}
const duplicateItems = querySceneItems();
const duplicatedContainer = duplicateItems.find(
  (item) => item.selected && Math.abs(item.x - 200) < 0.001 && Math.abs(item.y) < 0.001,
);
const duplicatedChild = duplicateItems.find(
  (item) => item.selected && Math.abs(item.x - 220) < 0.001 && Math.abs(item.y - 20) < 0.001,
);
if (!duplicatedContainer || !duplicatedChild) {
  throw new Error("Duplicated container subtree was not selected at the expected positions.");
}
if (updateRectPosition(duplicatedContainer.objectId, 240, 10) !== 0) {
  throw new Error("Failed to move duplicated container.");
}
const movedDuplicatedChild = querySceneItemByObjectId(duplicatedChild.objectId);
expectNear(movedDuplicatedChild.x, 260, "Duplicated child follows x");
expectNear(movedDuplicatedChild.y, 30, "Duplicated child follows y");

wasm.blitz_clear_scene();
wasm.blitz_create_rect(0, 0, 300, 300, 0.95, 0.95, 1, 1, 0, 0, 0, 1, 1);
const toggleRootId = readLastCreatedObjectId();
if (wasm.blitz_set_container(...toggleRootId, 1) !== 1) {
  throw new Error("Failed to tag the toggle root as a container.");
}
wasm.blitz_create_rect(50, 50, 100, 100, 1, 1, 1, 1, 0, 0, 0, 1, 1);
const toggledContainerId = readLastCreatedObjectId();
wasm.blitz_create_rect(70, 70, 20, 20, 1, 0.8, 0.8, 1, 0, 0, 0, 1, 1);
const adoptedId = readLastCreatedObjectId();
wasm.blitz_create_rect(130, 130, 60, 60, 0.8, 1, 0.8, 1, 0, 0, 0, 1, 1);
const partiallyInsideId = readLastCreatedObjectId();
if (wasm.blitz_set_container(...toggledContainerId, 1) !== 1) {
  throw new Error("Enabling a container did not report a change.");
}
let adoptedItem = querySceneItemByObjectId(adoptedId);
let partiallyInsideItem = querySceneItemByObjectId(partiallyInsideId);
if (updateRectPosition(toggledContainerId, 80, 90) !== 0) {
  throw new Error("Failed to move a toggled container.");
}
adoptedItem = querySceneItemByObjectId(adoptedId);
partiallyInsideItem = querySceneItemByObjectId(partiallyInsideId);
expectNear(adoptedItem.x, 100, "Toggle-adopted child x");
expectNear(adoptedItem.y, 110, "Toggle-adopted child y");
expectNear(partiallyInsideItem.x, 130, "Partially contained item stable x");
expectNear(partiallyInsideItem.y, 130, "Partially contained item stable y");
if (wasm.blitz_set_container(...toggledContainerId, 0) !== 1) {
  throw new Error("Disabling a container did not report a change.");
}
if (updateRectPosition(toggledContainerId, 120, 130) !== 0) {
  throw new Error("Failed to move a disabled former container.");
}
adoptedItem = querySceneItemByObjectId(adoptedId);
expectNear(adoptedItem.x, 100, "Toggle-detached child x");
expectNear(adoptedItem.y, 110, "Toggle-detached child y");
if (updateRectPosition(toggleRootId, 10, 15) !== 0) {
  throw new Error("Failed to move the toggle root container.");
}
adoptedItem = querySceneItemByObjectId(adoptedId);
expectNear(adoptedItem.x, 110, "Toggle-detached child underlying root x");
expectNear(adoptedItem.y, 125, "Toggle-detached child underlying root y");

wasm.blitz_clear_scene();
const bulkContainerIds: number[][] = [];
const bulkChildIds: number[][] = [];
for (let index = 0; index < 40; index += 1) {
  const x = index * 30;
  wasm.blitz_create_rect(x, 0, 20, 20, 0.8, 0.8, 1, 1, 0, 0, 0, 1, 1);
  const bulkContainerId = readLastCreatedObjectId();
  if (wasm.blitz_set_container(...bulkContainerId, 1) !== 1) {
    throw new Error("Failed to tag a bulk container.");
  }
  wasm.blitz_create_rect(x + 4, 4, 8, 8, 1, 0.8, 0.8, 1, 0, 0, 0, 1, 1);
  const bulkChildId = readLastCreatedObjectId();
  if (wasm.blitz_set_relative_transform(...bulkChildId, ...bulkContainerId, 4, 4) !== 1) {
    throw new Error("Failed to attach a bulk child.");
  }
  bulkContainerIds.push(bulkContainerId);
  bulkChildIds.push(bulkChildId);
}
wasm.blitz_select_all();
wasm.blitz_pointer_down(510, 510, 0);
wasm.blitz_pointer_move(530, 530);
wasm.blitz_pointer_up();
const firstBulkContainer = querySceneItemByObjectId(bulkContainerIds[0]);
const firstBulkChild = querySceneItemByObjectId(bulkChildIds[0]);
expectNear(firstBulkChild.x, firstBulkContainer.x + 4, "Bulk child kept relative x");
expectNear(firstBulkChild.y, firstBulkContainer.y + 4, "Bulk child kept relative y");
if (updateRectPosition(bulkContainerIds[0], firstBulkContainer.x + 10, firstBulkContainer.y + 12) !== 0) {
  throw new Error("Failed to move a bulk container after drag.");
}
const movedBulkChild = querySceneItemByObjectId(bulkChildIds[0]);
expectNear(movedBulkChild.x, firstBulkContainer.x + 14, "Bulk child follows after skipped retarget x");
expectNear(movedBulkChild.y, firstBulkContainer.y + 16, "Bulk child follows after skipped retarget y");

wasm.blitz_clear_scene();
wasm.blitz_load_demo_template();
wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 4);
const demoSlideId = queriedObjectIdAt(0);
const demoChildId = queriedObjectIdAt(1);
const demoSlide = querySceneItemByObjectId(demoSlideId);
const demoChild = querySceneItemByObjectId(demoChildId);
if (demoSlide.kind !== 4) {
  throw new Error("The demo slide root should be a frame.");
}
wasm.blitz_select_object(demoChildId[0], demoChildId[1], demoChildId[2], demoChildId[3], 0);
if (wasm.blitz_selected_container_state() !== 2) {
  throw new Error("Demo slide inner rectangles should be containers.");
}
if (updateRectPosition(demoSlideId, demoSlide.x + 25, demoSlide.y + 35, demoSlide.kind) !== 0) {
  throw new Error("Failed to move the demo slide container.");
}
const movedDemoChild = querySceneItemByObjectId(demoChildId);
expectNear(movedDemoChild.x, demoChild.x + 25, "Demo child relative x");
expectNear(movedDemoChild.y, demoChild.y + 35, "Demo child relative y");

wasm.blitz_clear_scene();
const emptyRevision = wasm.blitz_scene_revision();
wasm.blitz_set_camera(321, -123, 1.75);
if (wasm.blitz_scene_revision() !== emptyRevision) {
  throw new Error("Changing the viewport should not mark the scene as modified.");
}
wasm.blitz_create_rect(10, 20, 200, 100, 0.2, 0.4, 0.8, 0.5, 0.1, 0.2, 0.3, 1, 4);
wasm.blitz_create_circle(400, 220, 64, 0.2, 0.8, 0.5, 1, 0.1, 0.3, 0.2, 1, 2);
wasm.blitz_create_triangle(-80, 50, 120, 90, 1, 0.8, 0.4, 1, 0.8, 0.2, 0.1, 1, 3);

const text = textEncoder.encode("Binary scene ✓");
new Uint8Array(wasm.memory.buffer, wasm.blitz_text_input_ptr(), text.byteLength).set(text);
wasm.blitz_create_text(
  30,
  300,
  42,
  1,
  1,
  1,
  1,
  text.byteLength,
  180,
  1.4,
  3,
  1,
);
const frameRoundTripTitleLength = writeTextInput("Saved frame");
wasm.blitz_create_frame(
  -260,
  -160,
  180,
  120,
  1,
  1,
  1,
  1,
  0.25,
  0.3,
  0.4,
  1,
  1.5,
  0.4,
  0.2,
  0.8,
  0.9,
  19,
  frameRoundTripTitleLength,
);
const frameRoundTripId = readLastCreatedObjectId();
if (wasm.blitz_scene_revision() === emptyRevision) {
  throw new Error("Scene mutations did not advance the revision.");
}

const originalEntities = wasm.blitz_entity_count();
wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 10);
const firstStableId = readObjectId(wasm.blitz_scene_query_ptr());
const revisionBeforeSelectAll = wasm.blitz_scene_revision();
wasm.blitz_clear_selection();
if (wasm.blitz_select_object(firstStableId[0], firstStableId[1], firstStableId[2], firstStableId[3], 0) !== 1) {
  throw new Error("Selecting by stable object ID failed.");
}
if (wasm.blitz_selected_count() !== 1) {
  throw new Error("Selecting by stable object ID selected the wrong number of objects.");
}
wasm.blitz_select_all();
if (wasm.blitz_selected_count() !== originalEntities) {
  throw new Error("Select all did not select every scene object.");
}
if (wasm.blitz_scene_revision() !== revisionBeforeSelectAll) {
  throw new Error("Select all should not mark the scene as modified.");
}
if (wasm.blitz_selected_style_kind() !== 3) {
  throw new Error("Mixed selection did not expose geometry and text style capabilities.");
}
wasm.blitz_set_selected_fill(0.15, 0.25, 0.35);
wasm.blitz_set_selected_text_color(0.7, 0.6, 0.5);
wasm.blitz_set_selected_text_opacity(0.45);
const mixedStyle = new Float32Array(
  wasm.memory.buffer,
  wasm.blitz_selected_style_ptr(),
  wasm.blitz_selected_style_f32_count(),
);
if (
  Math.abs(mixedStyle[0] - 0.15) > 0.001 ||
  Math.abs(mixedStyle[9] - 0.7) > 0.001 ||
  Math.abs(mixedStyle[12] - 0.45) > 0.001
) {
  throw new Error("Mixed selection styles were not applied to supported entities.");
}
const revisionBeforeSelectionChange = wasm.blitz_scene_revision();
wasm.blitz_clear_selection();
if (wasm.blitz_scene_revision() !== revisionBeforeSelectionChange) {
  throw new Error("Changing selection should not mark the scene as modified.");
}
const defaultViewByteCount = wasm.blitz_scene_serialize();
if (defaultViewByteCount <= 32) {
  throw new Error(`Serialization failed with byte count ${defaultViewByteCount}.`);
}
const defaultViewHeader = new DataView(
  wasm.memory.buffer,
  wasm.blitz_scene_file_buffer_ptr(),
  32,
);
if (
  Math.abs(defaultViewHeader.getFloat32(16, true)) > 0.001 ||
  Math.abs(defaultViewHeader.getFloat32(20, true)) > 0.001 ||
  Math.abs(defaultViewHeader.getFloat32(24, true) - 1) > 0.001
) {
  throw new Error("A regular save unexpectedly captured the current viewport.");
}

wasm.blitz_capture_start_viewpoint();
const byteCount = wasm.blitz_scene_serialize();
if (byteCount <= 32) {
  throw new Error(`Serialization failed with byte count ${byteCount}.`);
}
const fileBytes = new Uint8Array(
  wasm.memory.buffer,
  wasm.blitz_scene_file_buffer_ptr(),
  byteCount,
).slice();

wasm.blitz_clear_scene();
if (wasm.blitz_entity_count() !== 0) {
  throw new Error("Scene clear failed.");
}
new Uint8Array(wasm.memory.buffer, wasm.blitz_scene_file_buffer_ptr(), byteCount).set(fileBytes);
const loadError = wasm.blitz_scene_deserialize(byteCount);
if (loadError !== 0) {
  throw new Error(`Deserialization failed with error ${loadError}.`);
}
if (wasm.blitz_entity_count() !== originalEntities) {
  throw new Error("Entity count changed during the binary round trip.");
}
if (wasm.blitz_selected_count() !== 0) {
  throw new Error("Selection state should not be restored from a scene file.");
}
wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 10);
const restoredStableId = readObjectId(wasm.blitz_scene_query_ptr());
if (!objectIdEquals(restoredStableId, firstStableId)) {
  throw new Error("Stable object IDs changed during the binary round trip.");
}
const restoredItems = new DataView(
  wasm.memory.buffer,
  wasm.blitz_scene_query_ptr(),
  wasm.blitz_scene_query_item_bytes() * wasm.blitz_scene_query_count(),
);
const itemBytes = wasm.blitz_scene_query_item_bytes();
const restoredTextOffset = itemBytes * 3;
if (
  Math.abs(restoredItems.getFloat32(restoredTextOffset + 96, true) - 180) > 0.001 ||
  Math.abs(restoredItems.getFloat32(restoredTextOffset + 100, true) - 1.4) > 0.001 ||
  restoredItems.getFloat32(restoredTextOffset + 104, true) !== 3 ||
  restoredItems.getFloat32(restoredTextOffset + 108, true) !== 1
) {
  throw new Error("Multiline text layout settings changed during the binary round trip.");
}

const uniforms = new Float32Array(
  wasm.memory.buffer,
  wasm.blitz_uniform_ptr(),
  wasm.blitz_uniform_f32_count(),
);
if (
  Math.abs(uniforms[2] - 321) > 0.001 ||
  Math.abs(uniforms[3] + 123) > 0.001 ||
  Math.abs(uniforms[4] - 1.75) > 0.001
) {
  throw new Error(`Camera state was not restored: ${JSON.stringify(Array.from(uniforms.slice(0, 5)))}`);
}

wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 10);
if (wasm.blitz_scene_query_total() !== 5) {
  throw new Error(`Expected five restored objects, received ${wasm.blitz_scene_query_total()}.`);
}
const restoredFrame = querySceneItemByObjectId(frameRoundTripId);
wasm.blitz_select_object(
  frameRoundTripId[0],
  frameRoundTripId[1],
  frameRoundTripId[2],
  frameRoundTripId[3],
  0,
);
if (wasm.blitz_selected_container_state() !== 2) {
  throw new Error("A restored frame did not keep its required container component.");
}
const restoredFrameTitlePtr = wasm.blitz_selected_frame_title_ptr();
if (
  readText(restoredFrameTitlePtr, wasm.blitz_selected_frame_title_length()) !==
  "Saved frame"
) {
  throw new Error("A restored frame did not keep its title.");
}
const restoredFrameStyle = new Float32Array(
  wasm.memory.buffer,
  wasm.blitz_selected_style_ptr(),
  wasm.blitz_selected_style_f32_count(),
);
if (
  Math.abs(restoredFrame.width - 180) > 0.001 ||
  Math.abs(restoredFrame.height - 120) > 0.001 ||
  Math.abs(restoredFrameStyle[14] - 19) > 0.001 ||
  Math.abs(restoredFrameStyle[9] - 0.7) > 0.001 ||
  Math.abs(restoredFrameStyle[10] - 0.6) > 0.001 ||
  Math.abs(restoredFrameStyle[11] - 0.5) > 0.001 ||
  Math.abs(restoredFrameStyle[12] - 0.45) > 0.001
) {
  throw new Error("A restored frame did not keep its bounds or title style.");
}

const liveBeforeInvalidFile = wasm.blitz_entity_count();
const fileBuffer = new Uint8Array(wasm.memory.buffer, wasm.blitz_scene_file_buffer_ptr(), byteCount);
fileBuffer[0] ^= 0xff;
if (wasm.blitz_scene_deserialize(byteCount) !== 2) {
  throw new Error("Invalid file magic was not rejected.");
}
if (wasm.blitz_entity_count() !== liveBeforeInvalidFile) {
  throw new Error("Invalid input modified the live scene.");
}

const v2Bytes = new Uint8Array(32 + 80);
v2Bytes.set(fileBytes.subarray(0, 32), 0);
v2Bytes.set(fileBytes.subarray(32, 32 + 80), 32);
const v2View = new DataView(v2Bytes.buffer);
v2View.setUint32(4, 2, true);
v2View.setUint32(8, v2Bytes.byteLength, true);
v2View.setUint32(12, 1, true);
v2View.setUint32(36, 80, true);
new Uint8Array(wasm.memory.buffer, wasm.blitz_scene_file_buffer_ptr(), v2Bytes.byteLength).set(
  v2Bytes,
);
if (wasm.blitz_scene_deserialize(v2Bytes.byteLength) !== 0) {
  throw new Error("Version 2 scene migration failed.");
}
wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 1);
const migratedId = readObjectId(wasm.blitz_scene_query_ptr());
if (
  migratedId[0] !== 0 ||
  migratedId[1] !== 0 ||
  migratedId[2] !== 0 ||
  migratedId[3] !== firstStableId[3]
) {
  throw new Error(`Version 2 object ID was not migrated correctly: ${migratedId.join(",")}.`);
}

console.log(`Binary scene round-trip passed (${byteCount} bytes).`);
