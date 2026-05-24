export const SIM_YOLO_CLASS_NAMES = Object.freeze([
  "sim_target",
  "sim_front",
  "sim_top",
  "sim_left",
  "sim_right"
]);

export const SIM_POSE_ANCHORS = Object.freeze([
  {
    name: "front",
    className: "sim_front",
    classId: 1,
    local: { x: 0, y: 0.82, z: 0.48 },
    halfSize: 0.09
  },
  {
    name: "top",
    className: "sim_top",
    classId: 2,
    local: { x: 0, y: 1.84, z: 0 },
    halfSize: 0.08
  },
  {
    name: "left",
    className: "sim_left",
    classId: 3,
    local: { x: -0.48, y: 0.82, z: 0 },
    halfSize: 0.09
  },
  {
    name: "right",
    className: "sim_right",
    classId: 4,
    local: { x: 0.48, y: 0.82, z: 0 },
    halfSize: 0.09
  }
]);

export const SIM_YOLO_CLASS_IDS = Object.freeze(
  Object.fromEntries(SIM_YOLO_CLASS_NAMES.map((className, classId) => [className, classId]))
);

export function createRng(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function clampBox(box, imageWidth, imageHeight) {
  const x1 = clamp(box.x - box.width / 2, 0, imageWidth);
  const y1 = clamp(box.y - box.height / 2, 0, imageHeight);
  const x2 = clamp(box.x + box.width / 2, 0, imageWidth);
  const y2 = clamp(box.y + box.height / 2, 0, imageHeight);
  return {
    x: (x1 + x2) / 2,
    y: (y1 + y2) / 2,
    width: Math.max(0, x2 - x1),
    height: Math.max(0, y2 - y1)
  };
}

export function toYoloLabel(box, imageWidth, imageHeight, classId = 0) {
  const clamped = clampBox(box, imageWidth, imageHeight);
  const nx = clamped.x / imageWidth;
  const ny = clamped.y / imageHeight;
  const nw = clamped.width / imageWidth;
  const nh = clamped.height / imageHeight;
  return [classId, nx, ny, nw, nh].map(formatField).join(" ");
}

export function toYoloLabels(sample, imageWidth, imageHeight) {
  const bodyBox = sample.bodyBox ?? sample.box;
  const labels = bodyBox ? [toYoloLabel(bodyBox, imageWidth, imageHeight, 0)] : [];

  for (const anchorDefinition of SIM_POSE_ANCHORS) {
    const anchor = getAnchor(sample.anchors, anchorDefinition.name);
    const box = anchor?.box ?? anchor;
    if (box) {
      labels.push(toYoloLabel(box, imageWidth, imageHeight, anchorDefinition.classId));
    }
  }

  return labels;
}

export function toYoloLabelText(sample, imageWidth, imageHeight) {
  const labels = toYoloLabels(sample, imageWidth, imageHeight);
  return labels.length > 0 ? `${labels.join("\n")}\n` : "";
}

export function createPoseSidecar(sample) {
  const poseSource = sample.pose ?? sample.world ?? {};
  const worldSource = sample.world ?? sample.pose ?? {};
  return {
    pose: copyPose(poseSource),
    world: { ...worldSource },
    anchors: copyAnchors(sample.anchors)
  };
}

export function splitName(index, totalSamples = 1000, trainRatio = 0.88) {
  const total = Math.max(2, Math.floor(totalSamples));
  const bucket = ((index % total) + total) % total;
  return bucket < Math.round(total * trainRatio) ? "train" : "val";
}

function formatField(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return Number(value).toFixed(6);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function copyPose(source) {
  return {
    x: finiteOrZero(source.x),
    y: finiteOrZero(source.y),
    z: finiteOrZero(source.z),
    a: finiteOrZero(source.a),
    b: finiteOrZero(source.b),
    c: finiteOrZero(source.c)
  };
}

function copyAnchors(anchors) {
  const copied = {};
  for (const definition of SIM_POSE_ANCHORS) {
    const anchor = getAnchor(anchors, definition.name);
    if (!anchor) {
      continue;
    }
    copied[definition.name] = copyAnchor(anchor, definition);
  }
  return copied;
}

function copyAnchor(anchor, definition) {
  const copied = {
    name: definition.name,
    className: anchor.className ?? definition.className,
    classId: Number.isInteger(anchor.classId) ? anchor.classId : definition.classId
  };
  for (const key of ["x", "y", "z"]) {
    if (Number.isFinite(anchor[key])) {
      copied[key] = anchor[key];
    }
  }
  const box = anchor.box ?? anchor;
  if (box && Number.isFinite(box.x) && Number.isFinite(box.y)) {
    copied.box = {
      x: box.x,
      y: box.y,
      width: finiteOrZero(box.width),
      height: finiteOrZero(box.height)
    };
  }
  if (anchor.world) {
    copied.world = {};
    for (const key of ["x", "y", "z"]) {
      if (Number.isFinite(anchor.world[key])) {
        copied.world[key] = anchor.world[key];
      }
    }
  }
  if (typeof anchor.visible === "boolean") {
    copied.visible = anchor.visible;
  }
  return copied;
}

function getAnchor(anchors, name) {
  if (!anchors) {
    return null;
  }
  if (Array.isArray(anchors)) {
    return anchors.find((anchor) => anchor?.name === name) ?? null;
  }
  return anchors[name] ?? null;
}

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}
