export function createAimRuntime(options = {}) {
  return {
    autoAimEnabled: Boolean(options.autoAimEnabled),
    pauseBinding: normalizeKeyBinding(options.pauseBinding ?? "F3")
  };
}

export function handleAutoAimHotkey(runtime, event = {}) {
  if (!runtime || event.repeat || normalizeKeyBinding(event.code) !== runtime.pauseBinding) {
    return false;
  }

  runtime.autoAimEnabled = !runtime.autoAimEnabled;
  return true;
}

export function shouldApplySimulationAim(options = {}) {
  return Boolean(options.autoAimEnabled) && !Boolean(options.externalMovement);
}

export function resolveExternalMovementMode(params = new URLSearchParams()) {
  const movement = String(params.get("movement") ?? "").toLowerCase();
  if (movement === "main" || params.get("externalMovement") === "1") {
    return true;
  }
  if (movement === "simulation" || params.get("internalMovement") === "1") {
    return false;
  }
  return false;
}

function normalizeKeyBinding(value) {
  const normalized = String(value ?? "").trim();
  return normalized || "F3";
}
