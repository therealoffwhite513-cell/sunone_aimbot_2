export function createSpeedControlsState() {
  return {
    hidden: false,
    buttonLabel: "Hide Speed Controls"
  };
}

export function toggleSpeedControlsVisibility(state) {
  state.hidden = !state.hidden;
  state.buttonLabel = state.hidden ? "Show Speed Controls" : "Hide Speed Controls";
  return state;
}
